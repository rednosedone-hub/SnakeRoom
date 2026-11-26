import { allowedOrigin, authenticatedUser, json, profileForUser, stripePost } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  const cors = allowedOrigin(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  const user = await authenticatedUser(request);
  if (!user?.id) return json({ error: "Sign in to manage billing." }, 401, cors);

  try {
    const profile = await profileForUser(user.id);
    if (!profile?.stripe_customer_id) return json({ error: "This account has no Stripe subscription yet." }, 404, cors);
    const appUrl = Deno.env.get("APP_URL")!.replace(/\/$/, "");
    const portal = await stripePost("billing_portal/sessions", new URLSearchParams({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/account.html`,
    }));
    return json({ url: portal.url }, 200, cors);
  } catch (error) {
    console.error("Billing portal creation failed", error);
    return json({ error: error instanceof Error ? error.message : "Could not open billing management." }, 500, cors);
  }
});
