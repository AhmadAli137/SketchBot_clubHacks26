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
    if resp.data:
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
    return resp.data["credits_used"] if resp.data else 0


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


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (subscription created / updated / deleted)."""
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(status_code=501, detail="Stripe not configured")
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe  # type: ignore[import]
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    sub_obj = event.get("data", {}).get("object", {})
    if event["type"] in ("customer.subscription.created", "customer.subscription.updated"):
        _sync_subscription(sub_obj)
    elif event["type"] == "customer.subscription.deleted":
        _downgrade_subscription(sub_obj)
    return {"received": True}


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
    price_id = (sub_obj.get("items", {}).get("data", [{}])[0].get("price", {}).get("id", ""))
    tier = _price_to_tier(price_id)
    resp = (
        client.table("user_subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", sub_obj["customer"])
        .maybe_single()
        .execute()
    )
    if not resp.data:
        return
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
    if not resp.data:
        return
    client.table("user_subscriptions").update({
        "tier": "free",
        "status": "canceled",
        "stripe_subscription_id": None,
        "monthly_credits": TIER_CREDITS["free"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", resp.data["user_id"]).execute()
