# Stripe billing setup

The app now has Stripe-hosted subscription checkout and subscription management, plus a signed Stripe webhook that updates each account's billing profile. Checkout is deliberately off until `BILLING_ENABLED=true`. Beta accounts (`beta_access=true`) cannot be charged and keep full access.

## 1. Create the Stripe prices

In Stripe Dashboard, create one product for each paid plan and add two recurring prices to each product. Set the currency to CAD:

| Product | Monthly | Yearly |
| --- | ---: | ---: |
| Keeper | $9 CAD / month | $90 CAD / year |
| Breeder | $24 CAD / month | $240 CAD / year |
| Pro | $49 CAD / month | $490 CAD / year |

Copy each Price ID (`price_...`). Use Test mode first; Test mode and Live mode have separate products and price IDs. Complete Stripe's business and payout setup before switching to Live mode.

## 2. Install billing profiles

The regular account backup table must already exist. In Supabase **SQL Editor**, run `supabase/migrations/202611260001_billing_profiles.sql`. Existing accounts are added as beta testers so this migration does not start charging anyone. New signups also receive beta access during the test period.

When ready to launch, first set each invited tester's `beta_access` to `true`. Then set other accounts to `plan='free'`, `beta_access=false`. Change the `create_billing_profile_for_user()` insert values in the migration from beta/true to free/false before applying that updated function, so new accounts join the free plan after launch.

The migration also installs a database trigger on `snake_room_backups` that blocks new animals or new per-animal photos over the account's limit while leaving existing over-limit records readable and editable. Run it after the backup table exists.

## 3. Add Supabase function secrets

In Supabase **Project Settings → Edge Functions → Secrets**, set:

- `APP_URL`: the public root URL where this app is hosted (no trailing slash)
- `BILLING_ENABLED`: `false` while configuring; set `true` only for checkout testing or launch
- `STRIPE_SECRET_KEY`: the Stripe secret key for the matching mode (`sk_test_...` first)
- `STRIPE_PRICE_KEEPER_MONTH`, `STRIPE_PRICE_KEEPER_YEAR`
- `STRIPE_PRICE_BREEDER_MONTH`, `STRIPE_PRICE_BREEDER_YEAR`
- `STRIPE_PRICE_PRO_MONTH`, `STRIPE_PRICE_PRO_YEAR`

After creating the webhook in the next step, add `STRIPE_WEBHOOK_SECRET` (`whsec_...`). Keep secret keys in Supabase Secrets; do not put them in the site files or commit them. Supabase provides its project URL, anon key, and service-role key to deployed Edge Functions.

## 4. Deploy the functions

From the project folder, after installing and linking the Supabase CLI to project `frspbmxtymonlfbfzfpr`, deploy:

```powershell
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy stripe-webhook
```

The checkout and portal functions require a signed-in Supabase user. The webhook verifies Stripe's signature and is the only code path that writes subscription state.

## 5. Register the Stripe webhook

In Stripe **Workbench → Webhooks**, create an endpoint at:

`https://frspbmxtymonlfbfzfpr.supabase.co/functions/v1/stripe-webhook`

Select these events:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the endpoint signing secret to the Supabase `STRIPE_WEBHOOK_SECRET` secret. This endpoint must use Stripe's snapshot webhook payload.

## 6. Configure the customer portal and test

Enable Stripe's customer portal and allow customers to cancel and switch between the Keeper, Breeder, and Pro prices. Keep `BILLING_ENABLED=false` until the app URL, six prices, webhook, and portal are configured. For a test purchase, use Test mode price IDs and secret key, set `BILLING_ENABLED=true`, and temporarily change `BILLING_LIVE` to `true` in `plans.js` so the tier locks can be reviewed. Sign in with a non-beta test account. Confirm checkout, cancellation/plan changes, and that the profile reflects the webhook update. Keep actual beta accounts marked beta. Set `BILLING_LIVE` back to `false` after testing.

For launch, replace all Test mode Price IDs and the test secret/webhook with their Live mode values, verify the selected beta accounts remain free, change `BILLING_LIVE` to `true` in `plans.js`, update its cache version to `v=6` in the HTML pages that load it, then set `BILLING_ENABLED=true`. Stripe-hosted Checkout and webhooks are used here, following [Stripe's subscription integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions) and [webhook guidance](https://docs.stripe.com/webhooks). Supabase Edge Functions hold the server secrets and run the webhook/checkout endpoints ([Supabase docs](https://supabase.com/docs/guides/functions)).
