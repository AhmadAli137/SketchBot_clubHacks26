# Payments & Stripe Setup

Complete reference for AIBotics subscription billing — Stripe configuration, Render environment variables, backend logic, frontend flow, and Supabase schema.

---

## Architecture Overview

```
User (browser)
  │
  ├─ clicks "Start Classroom" on /pricing
  │
  ▼
admin-web (Next.js)                      Stripe
  │  PricingCards client component         │
  │  POST /api/subscriptions/checkout ───► Stripe Checkout Session created
  │  ◄── { url: "https://checkout.stripe.com/..." }
  │
  ▼
Browser redirects to Stripe-hosted checkout page
  │
  ▼ (payment complete)
Stripe redirects to https://aibotics.app/account?upgraded=1
  │
  │  Stripe also fires webhooks:
  │    1. checkout.session.completed  ──► backend links stripe_customer_id → user_id
  │    2. customer.subscription.created ► backend sets tier + credits in Supabase
  │
  ▼
Account page shows green "You're upgraded!" banner
Entitlements endpoint returns new tier on next fetch
```

---

## Stripe Dashboard Setup

### Account
- **Name:** AIBotics sandbox / AiBotics
- **Mode:** Test mode during development — switch to Live when ready
- **Statement descriptor:** `AIBOTICS EDU`
- **Shortened descriptor:** `AIBOTICS`

---

### Products & Prices (CAD)

Create 3 products in **Product catalog**, each with 2 recurring prices.

#### AIBotics Home
> Full access for one learner and a parent. 300 AI credits/month, real robot support for 1 SketchBot.

| Price | Amount | Period | Env var |
|-------|--------|--------|---------|
| Monthly | CA$15.99 | Monthly | `STRIPE_PRICE_HOME_MONTHLY` |
| Annual  | CA$159.99 | Yearly | `STRIPE_PRICE_HOME_ANNUAL` |

#### AIBotics Classroom
> One teacher + 30 students. 2,500 pooled AI credits/month, up to 4 robots.

| Price | Amount | Period | Env var |
|-------|--------|--------|---------|
| Monthly | CA$59.99 | Monthly | `STRIPE_PRICE_CLASSROOM_MONTHLY` |
| Annual  | CA$599.99 | Yearly | `STRIPE_PRICE_CLASSROOM_ANNUAL` |

#### AIBotics School
> Building-wide license, 10 teachers + unlimited students. 15,000 pooled AI credits/month, up to 20 robots.

| Price | Amount | Period | Env var |
|-------|--------|--------|---------|
| Monthly | CA$299.99 | Monthly | `STRIPE_PRICE_SCHOOL_MONTHLY` |
| Annual  | CA$2,999.99 | Yearly | `STRIPE_PRICE_SCHOOL_ANNUAL` |

> **Annual = 10 months billing** (2 months free, ~17% savings) on every tier.

---

### Webhook

**Location:** Developers → Webhooks → Add endpoint

| Field | Value |
|-------|-------|
| Endpoint URL | `https://sketchbot-backend.onrender.com/api/subscriptions/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` |

After creating the webhook, click **Reveal** next to **Signing secret** to get the `whsec_...` value.

> **Why `checkout.session.completed`?**  
> Stripe's `customer.subscription.created` event only carries the Stripe customer ID, not the AIBotics user UUID. `checkout.session.completed` includes `client_reference_id` (the user UUID passed at checkout creation), which the backend uses to link the two. This event must be processed before `subscription.created` or the sync will silently fail.

---

### API Keys

| Key | Where to find | Where it goes |
|-----|---------------|---------------|
| Secret key (`sk_test_...` / `sk_live_...`) | Developers → API keys → Reveal | Render env var `STRIPE_SECRET_KEY` |
| Webhook signing secret (`whsec_...`) | Developers → Webhooks → your endpoint → Reveal | Render env var `STRIPE_WEBHOOK_SECRET` |
| Publishable key (`pk_...`) | Developers → API keys | Not needed — backend-only checkout |

---

## Render Environment Variables

Set these on the cloud-backend service in the Render dashboard:

| Key | Value | Notes |
|-----|-------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` | Required for checkout & webhook |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Required to verify webhook signatures |
| `STRIPE_PRICE_HOME_MONTHLY` | `price_...` | From Stripe product catalog |
| `STRIPE_PRICE_HOME_ANNUAL` | `price_...` | |
| `STRIPE_PRICE_CLASSROOM_MONTHLY` | `price_...` | |
| `STRIPE_PRICE_CLASSROOM_ANNUAL` | `price_...` | |
| `STRIPE_PRICE_SCHOOL_MONTHLY` | `price_...` | |
| `STRIPE_PRICE_SCHOOL_ANNUAL` | `price_...` | |
| `APP_URL` | `https://aibotics.app` | Stripe redirects back here after checkout |
| `SUPABASE_URL` | `https://wpphapmlomoppseapfjn.supabase.co` | Already set |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Already set |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Already set |
| `CLOUD_CORS_ORIGINS` | `https://aibotics.app,...` | Already set |

> `SKIP_AUTH` is **not** set on Render — the backend defaults to `false` (real JWT validation active).  
> Only set `SKIP_AUTH=true` in local `.env` to bypass auth during development.

---

## Local Development `.env`

File: `services/cloud-backend/.env`

```env
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
OPENAI_API_KEY=sk-proj-...

SUPABASE_URL=https://wpphapmlomoppseapfjn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

SKIP_AUTH=true   # set false to test real JWT auth locally

CLOUD_CORS_ORIGINS=http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:3002,http://localhost:3002

# Stripe (test keys for local dev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_HOME_MONTHLY=price_...
STRIPE_PRICE_HOME_ANNUAL=price_...
STRIPE_PRICE_CLASSROOM_MONTHLY=price_...
STRIPE_PRICE_CLASSROOM_ANNUAL=price_...
STRIPE_PRICE_SCHOOL_MONTHLY=price_...
STRIPE_PRICE_SCHOOL_ANNUAL=price_...
APP_URL=http://localhost:3001
```

To test webhooks locally: `stripe listen --forward-to localhost:8010/api/subscriptions/webhook`

---

## Backend Code

### File: `services/cloud-backend/app/routers/subscriptions.py`

#### `GET /api/subscriptions/entitlements`
- Requires Bearer JWT (Supabase access token)
- Calls `_get_or_create_subscription` — lazily creates a free-tier row on first call for new users
- Returns tier, monthly_credits, credits_used, credits_remaining, status, period_end, can_connect_robot, can_use_ai

#### `POST /api/subscriptions/checkout`
- Requires Bearer JWT
- Body: `{ plan: 'home'|'classroom'|'school', billing: 'monthly'|'annual' }`
- Looks up the correct Stripe price ID from env vars
- Creates a Stripe Checkout Session with:
  - `client_reference_id` = user UUID (critical for webhook linking)
  - `customer_email` = user's email (pre-fills Stripe checkout)
  - `subscription_data.trial_period_days` = 7 (7-day free trial on all paid plans)
  - `success_url` = `{APP_URL}/account?upgraded=1`
  - `cancel_url` = `{APP_URL}/pricing`
- Returns `{ url: "https://checkout.stripe.com/..." }`

#### `POST /api/subscriptions/webhook`
- No auth — verified via Stripe signature (`STRIPE_WEBHOOK_SECRET`)
- Handles 4 events in order:

| Event | Handler | What it does |
|-------|---------|--------------|
| `checkout.session.completed` | `_link_customer_to_user` | Sets `stripe_customer_id` on user's subscription row using `client_reference_id` |
| `customer.subscription.created` | `_sync_subscription` | Sets tier, credits, status, period_end |
| `customer.subscription.updated` | `_sync_subscription` | Handles upgrades/downgrades |
| `customer.subscription.deleted` | `_downgrade_subscription` | Resets to free tier |

#### Tier → credits mapping

| Tier | Monthly credits | Robot support |
|------|----------------|---------------|
| free | 50 | No |
| home | 300 | Yes |
| classroom | 2,500 | Yes |
| school | 15,000 | Yes |
| district | Unlimited | Yes |

#### `deduct_credits(user_id, amount=1)`
Called after every successful AI response. Best-effort — never blocks on failure. Uses Supabase RPC `increment_credit_usage`.

#### `check_credits(user_id) → (bool, int)`
Called before AI requests. Returns `(has_credits, remaining)`. Fails open so backend outages don't block students.

### File: `services/cloud-backend/requirements.txt`
```
stripe>=10.0.0   # added — was missing, caused ImportError on checkout
```

---

## Frontend Code

### Pricing page — `apps/admin-web/src/app/pricing/`

**`pricing-cards.tsx`** (client component)
- Billing toggle state: `monthly | annual`
- For Explorer (free) and District: renders `<Link>` CTAs
- For Home, Classroom, School: renders `<CheckoutButton>` which:
  1. Reads Supabase session from browser client
  2. If no session → redirects to `/sign-in?redirect=/pricing`
  3. POSTs to `/api/subscriptions/checkout` with JWT + `{ plan, billing }`
  4. Redirects browser to returned Stripe URL

**`page.tsx`** (server component)
- Renders hero, credit table, add-ons, FAQ statically
- Embeds `<PricingCards />` for the interactive plan grid

### Account page — `apps/admin-web/src/app/account/`

**`upgrade-banner.tsx`** (client component)
- Shown when `?upgraded=1` is in URL (Stripe success redirect)
- Auto-removes the query param from URL on mount so refresh doesn't re-show it

**`page.tsx`**
- Reads `searchParams.upgraded` and passes `show` prop to `UpgradeBanner`
- "Upgrade plan →" link on the plan card points to `/pricing#<next-plan>`

---

## Supabase Schema

### `user_subscriptions` table

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid (PK, FK → auth.users) | |
| `tier` | text | `free`, `home`, `classroom`, `school`, `district` |
| `status` | text | `active`, `trialing`, `canceled`, `past_due` |
| `monthly_credits` | int | Set from TIER_CREDITS map on sync |
| `stripe_customer_id` | text | Set by `checkout.session.completed` webhook |
| `stripe_subscription_id` | text | Set by `subscription.created` webhook |
| `current_period_end` | timestamptz | Renewal date |
| `trial_end` | timestamptz | When trial expires |
| `updated_at` | timestamptz | |

### `credit_usage` table

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid (FK) | |
| `month` | text | Format: `YYYY-MM` |
| `credits_used` | int | Incremented via `increment_credit_usage` RPC |

### Required RPC function

```sql
create or replace function increment_credit_usage(
  p_user_id uuid,
  p_month text,
  p_amount int default 1
) returns void language plpgsql as $$
begin
  insert into credit_usage (user_id, month, credits_used)
  values (p_user_id, p_month, p_amount)
  on conflict (user_id, month)
  do update set credits_used = credit_usage.credits_used + excluded.credits_used;
end;
$$;
```

### Backfill existing users (run once in Supabase SQL editor)

```sql
insert into user_subscriptions (user_id, tier, status, monthly_credits)
select id, 'free', 'active', 50
from auth.users
on conflict (user_id) do nothing;
```

---

## Subscription Plans Managed In

Subscriptions can **only be managed through the admin-web** (`aibotics.app`). The desktop app shows entitlement state (tier badge, credit gauge) via the account panel, but has no checkout flow — it links to `aibotics.app/pricing`.

---

## Going Live Checklist

- [ ] Switch Stripe account from Test → Live mode
- [ ] Re-create products and prices in Live mode (new `price_...` IDs)
- [ ] Update all `STRIPE_PRICE_*` env vars on Render with Live price IDs
- [ ] Update `STRIPE_SECRET_KEY` on Render with Live secret key (`sk_live_...`)
- [ ] Create a new webhook in Live mode pointing to the same endpoint, update `STRIPE_WEBHOOK_SECRET`
- [ ] Set `APP_URL=https://aibotics.app` on Render (already the default)
- [ ] Verify `CLOUD_CORS_ORIGINS` includes `https://aibotics.app`
- [ ] Test end-to-end with a real card in Live mode
- [ ] Enable Stripe Radar fraud rules
- [ ] Set up Stripe tax settings if charging tax (GST/HST for Canadian customers)
