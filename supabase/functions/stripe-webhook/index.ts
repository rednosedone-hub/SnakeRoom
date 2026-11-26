import { configuredPrice, json } from "../_shared/billing.ts";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validSignature(rawBody: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  return signatures.some((signature: string) => {
    if (signature.length !== digest.length) return false;
    let mismatch = 0;
    for (let index = 0; index < digest.length; index++) mismatch |= digest.charCodeAt(index) ^ signature.charCodeAt(index);
    return mismatch === 0;
  });
}

async function saveSubscription(subscription: Record<string, any>, deleted = false) {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customer) return;
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id || firstItem?.plan?.id || "";
  const status = deleted ? "canceled" : String(subscription.status || "");
  const tier = deleted ? "free" : ["keeper", "breeder", "pro"].find((candidate) =>
    ["month", "year"].some((interval) => configuredPrice(candidate, interval) === priceId && priceId)
  );
  if (!tier && !deleted) return;

  const userId = subscription.metadata?.user_id;
  const url = new URL(`${Deno.env.get("SUPABASE_URL")}/rest/v1/billing_profiles`);
  if (userId) {
    url.searchParams.set("on_conflict", "user_id");
  } else {
    url.searchParams.set("stripe_customer_id", `eq.${customer}`);
  }
  const patch = {
    plan: tier || "free",
    ...(userId ? { user_id: userId, stripe_customer_id: customer } : {}),
    beta_access: false,
    subscription_status: status,
    stripe_subscription_id: deleted ? null : subscription.id,
    stripe_price_id: deleted ? null : priceId,
    current_period_end: deleted || !subscription.current_period_end
      ? null : new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: deleted ? false : Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const response = await fetch(url, {
      method: userId ? "POST" : "PATCH",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: userId ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Could not update plan profile (${response.status}).`);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const signature = request.headers.get("stripe-signature") || "";
  const body = await request.text();
  if (!secret || !await validSignature(body, signature, secret)) return json({ error: "Invalid Stripe signature." }, 400);

  try {
    const event = JSON.parse(body);
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      await saveSubscription(event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await saveSubscription(event.data.object, true);
    }
    return json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
