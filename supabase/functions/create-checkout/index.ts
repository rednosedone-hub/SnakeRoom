import { allowedOrigin, authenticatedUser, configuredPrice, json, profileForUser, stripePost } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  const cors = allowedOrigin(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...cors, ...{
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } } });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  if (Deno.env.get("BILLING_ENABLED") !== "true") return json({ error: "Paid plans are not open yet. Beta access remains free." }, 503, cors);
  if (!Deno.env.get("STRIPE_SECRET_KEY") || !Deno.env.get("APP_URL")) return json({ error: "Billing is not configured yet." }, 503, cors);

  const user = await authenticatedUser(request);
  if (!user?.id) return json({ error: "Sign in before choosing a paid plan." }, 401, cors);

  try {
    const input = await request.json();
    const tier = String(input.tier || "");
    const interval = String(input.interval || "");
    const price = configuredPrice(tier, interval);
    if (!price) return json({ error: "That tier or billing interval is not available." }, 400, cors);

    const profile = await profileForUser(user.id);
    if (profile?.beta_access) return json({ error: "Beta testers keep full access free during beta." }, 403, cors);
    if (profile?.stripe_customer_id && ["active", "trialing", "past_due"].includes(profile.subscription_status)) {
      return json({ error: "This account already has a subscription. Use Manage Subscription to change it." }, 409, cors);
    }

    const appUrl = Deno.env.get("APP_URL")!.replace(/\/$/, "");
    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      "client_reference_id": user.id,
      "metadata[user_id]": user.id,
      "metadata[plan]": tier,
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan]": tier,
      "success_url": `${appUrl}/account.html?billing=success`,
      "cancel_url": `${appUrl}/account.html?billing=cancelled`,
      "billing_address_collection": "required",
    });
    if (user.email) params.set("customer_email", user.email);
    const checkout = await stripePost("checkout/sessions", params);
    return json({ url: checkout.url }, 200, cors);
  } catch (error) {
    console.error("Checkout session creation failed", error);
    return json({ error: error instanceof Error ? error.message : "Could not start checkout." }, 500, cors);
  }
});
