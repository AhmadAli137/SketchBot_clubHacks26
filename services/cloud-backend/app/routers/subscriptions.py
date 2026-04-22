from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import require_auth
from app.core.settings import settings

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

TIER_CREDITS: dict[str, int] = {
    "free":      50,
    "home":      300,
    "classroom": 2_500,
    "school":    15_000,
    "district":  999_999,
}

TIER_CAN_ROBOT: set[str] = {"home", "classroom", "school", "district"}


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _supabase():
    from app.auth import _supabase_client
    client = _supabase_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return client


def _get_or_create_subscription(client, user_id: str) -> dict:
    resp = (
        client.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if resp is not None and resp.data:
        return resp.data
    new = {
        "user_id": user_id,
        "tier": "free",
        "status": "active",
        "monthly_credits": TIER_CREDITS["free"],
    }
    insert = client.table("user_subscriptions").insert(new).execute()
    return insert.data[0] if insert.data else new


def _get_credits_used(client, user_id: str, month: str) -> int:
    resp = (
        client.table("credit_usage")
        .select("credits_used")
        .eq("user_id", user_id)
        .eq("month", month)
        .maybe_single()
        .execute()
    )
    return resp.data["credits_used"] if (resp is not None and resp.data) else 0


def deduct_credits(user_id: str, amount: int = 1) -> None:
    """Deduct `amount` credits for the current month. Called after successful AI responses."""
    if settings.skip_auth:
        return
    try:
        client = _supabase()
        month = _current_month()
        client.rpc(
            "increment_credit_usage",
            {"p_user_id": user_id, "p_month": month, "p_amount": amount},
        ).execute()
    except Exception:
        pass  # credit tracking is best-effort; never block on failure


def check_credits(user_id: str) -> tuple[bool, int]:
    """Return (has_credits, remaining). Returns (True, 999) in skip_auth mode."""
    if settings.skip_auth:
        return True, 999
    try:
        client = _supabase()
        sub = _get_or_create_subscription(client, user_id)
        month = _current_month()
        used = _get_credits_used(client, user_id, month)
        monthly = sub.get("monthly_credits") or TIER_CREDITS.get(sub.get("tier", "free"), 50)
        remaining = max(0, monthly - used)
        return remaining > 0, remaining
    except Exception:
        return True, -1  # fail open so outages don't block students


# ─── Endpoints ────────────────────────────────────────────────────────────────

class EntitlementsResponse(BaseModel):
    tier: str
    monthly_credits: int
    credits_used: int
    credits_remaining: int
    status: str
    period_end: str | None
    can_connect_robot: bool
    can_use_ai: bool


@router.get("/entitlements", response_model=EntitlementsResponse)
def get_entitlements(user: Annotated[dict, Depends(require_auth)]):
    """Return the authenticated user's plan entitlements and credit usage."""
    if settings.skip_auth:
        return EntitlementsResponse(
            tier="school",
            monthly_credits=15_000,
            credits_used=0,
            credits_remaining=15_000,
            status="active",
            period_end=None,
            can_connect_robot=True,
            can_use_ai=True,
        )

    client = _supabase()
    sub = _get_or_create_subscription(client, user["id"])
    month = _current_month()
    used = _get_credits_used(client, user["id"], month)
    monthly = sub.get("monthly_credits") or TIER_CREDITS.get(sub.get("tier", "free"), 50)
    remaining = max(0, monthly - used)
    tier = sub.get("tier", "free")

    return EntitlementsResponse(
        tier=tier,
        monthly_credits=monthly,
        credits_used=used,
        credits_remaining=remaining,
        status=sub.get("status", "active"),
        period_end=str(sub["current_period_end"]) if sub.get("current_period_end") else None,
        can_connect_robot=tier in TIER_CAN_ROBOT,
        can_use_ai=remaining > 0,
    )


class CheckoutRequest(BaseModel):
    plan: str       # 'home' | 'classroom' | 'school'
    billing: str = "monthly"


@router.post("/checkout")
def create_checkout(body: CheckoutRequest, user: Annotated[dict, Depends(require_auth)]):
    """Create a Stripe Checkout session. Requires STRIPE_SECRET_KEY in env."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=501,
            detail="Payments are not yet configured on this server. Email support@aibotics.app to upgrade.",
        )
    try:
        import stripe  # type: ignore[import]
        stripe.api_key = settings.stripe_secret_key
        price_map: dict[str, dict[str, str]] = {
            "home":      {"monthly": settings.stripe_price_home_monthly,      "annual": settings.stripe_price_home_annual},
            "classroom": {"monthly": settings.stripe_price_classroom_monthly,  "annual": settings.stripe_price_classroom_annual},
            "school":    {"monthly": settings.stripe_price_school_monthly,     "annual": settings.stripe_price_school_annual},
        }
        if body.plan not in price_map:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {body.plan}")
        price_id = price_map[body.plan].get(body.billing)
        if not price_id:
            raise HTTPException(status_code=400, detail=f"No price ID configured for {body.plan}/{body.billing}")
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.app_url}/account?upgraded=1",
            cancel_url=f"{settings.app_url}/pricing",
            client_reference_id=user["id"],
            customer_email=user.get("email"),
            subscription_data={"trial_period_days": 7},
        )
        return {"url": session.url}
    except ImportError:
        raise HTTPException(status_code=501, detail="Stripe library not installed on this server")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/portal")
def create_portal(user: Annotated[dict, Depends(require_auth)]):
    """Create a Stripe Customer Portal session so the user can manage/cancel their subscription."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=501, detail="Payments are not configured on this server.")
    try:
        import stripe  # type: ignore[import]
        stripe.api_key = settings.stripe_secret_key
        client = _supabase()
        sub = _get_or_create_subscription(client, user["id"])
        customer_id = sub.get("stripe_customer_id")
        if not customer_id:
            raise HTTPException(status_code=400, detail="No active subscription found. Purchase a plan first.")
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{settings.app_url}/account",
        )
        return {"url": session.url}
    except ImportError:
        raise HTTPException(status_code=501, detail="Stripe library not installed.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (subscription created / updated / deleted)."""
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(status_code=501, detail="Stripe not configured")
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe  # type: ignore[import]
        import json as _json
        stripe.api_key = settings.stripe_secret_key
        # Verify signature — raises if invalid
        stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
        # Parse body as plain dict (stripe v10 Event object doesn't support .get())
        event_dict = _json.loads(body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    obj = event_dict.get("data", {}).get("object", {})
    event_type = event_dict.get("type", "")
    try:
        if event_type == "checkout.session.completed":
            _link_customer_to_user(obj)
        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            _sync_subscription(obj)
        elif event_type == "customer.subscription.deleted":
            _downgrade_subscription(obj)
    except Exception as exc:
        # Log but always return 200 so Stripe doesn't keep retrying a bad event
        import logging
        logging.error("Webhook handler error [%s]: %s", event_type, exc, exc_info=True)
    return {"received": True}


def _link_customer_to_user(session_obj: dict) -> None:
    """On checkout.session.completed, store stripe_customer_id on the user's subscription row.
    This must run before customer.subscription.created so the lookup by customer ID works."""
    user_id = session_obj.get("client_reference_id")
    customer_id = session_obj.get("customer")
    if not user_id or not customer_id:
        return
    client = _supabase()
    sub = _get_or_create_subscription(client, user_id)
    client.table("user_subscriptions").update({
        "stripe_customer_id": customer_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", sub["user_id"]).execute()


def _price_to_tier(price_id: str) -> str:
    mapping = {
        settings.stripe_price_home_monthly:      "home",
        settings.stripe_price_home_annual:       "home",
        settings.stripe_price_classroom_monthly: "classroom",
        settings.stripe_price_classroom_annual:  "classroom",
        settings.stripe_price_school_monthly:    "school",
        settings.stripe_price_school_annual:     "school",
    }
    return mapping.get(price_id, "free")


def _sync_subscription(sub_obj: dict) -> None:
    client = _supabase()
    items_data = sub_obj.get("items", {}).get("data", [])
    price_id = items_data[0].get("price", {}).get("id", "") if items_data else ""
    tier = _price_to_tier(price_id)
    customer_id = sub_obj["customer"]

    resp = (
        client.table("user_subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customer_id)
        .maybe_single()
        .execute()
    )
    if resp is None or not resp.data:
        # checkout.session.completed may not have fired yet — look up user by email via auth
        from app.auth import _supabase_client
        sb = _supabase_client()
        if sb is None:
            return
        import stripe as _stripe  # type: ignore[import]
        _stripe.api_key = settings.stripe_secret_key
        customer = _stripe.Customer.retrieve(customer_id)
        email = (customer.email if hasattr(customer, "email") else customer.get("email", "")) or ""
        if not email:
            return
        users = sb.auth.admin.list_users()
        user = next((u for u in users if u.email and u.email.lower() == email.lower()), None)
        if not user:
            return
        sub = _get_or_create_subscription(client, str(user.id))
        client.table("user_subscriptions").update({
            "stripe_customer_id": customer_id,
        }).eq("user_id", str(user.id)).execute()
        user_id = str(user.id)
    else:
        user_id = resp.data["user_id"]
    period_end = (
        datetime.fromtimestamp(sub_obj["current_period_end"], tz=timezone.utc).isoformat()
        if sub_obj.get("current_period_end") else None
    )
    trial_end = (
        datetime.fromtimestamp(sub_obj["trial_end"], tz=timezone.utc).isoformat()
        if sub_obj.get("trial_end") else None
    )
    client.table("user_subscriptions").upsert({
        "user_id": user_id,
        "tier": tier,
        "stripe_subscription_id": sub_obj["id"],
        "stripe_customer_id": sub_obj["customer"],
        "status": sub_obj.get("status", "active"),
        "monthly_credits": TIER_CREDITS.get(tier, 50),
        "current_period_end": period_end,
        "trial_end": trial_end,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def _downgrade_subscription(sub_obj: dict) -> None:
    client = _supabase()
    resp = (
        client.table("user_subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", sub_obj["customer"])
        .maybe_single()
        .execute()
    )
    if resp is None or not resp.data:
        return
    client.table("user_subscriptions").update({
        "tier": "free",
        "status": "canceled",
        "stripe_subscription_id": None,
        "monthly_credits": TIER_CREDITS["free"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", resp.data["user_id"]).execute()
