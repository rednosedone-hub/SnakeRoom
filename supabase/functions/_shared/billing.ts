export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
}

export function allowedOrigin(request: Request) {
  const configured = Deno.env.get("APP_URL") || "";
  const origin = request.headers.get("origin") || "";
  if (!configured || !origin || new URL(configured).origin !== origin) return {};
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
}

export async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return null;
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      authorization,
    },
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function profileForUser(userId: string) {
  const url = new URL(`${Deno.env.get("SUPABASE_URL")}/rest/v1/billing_profiles`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("select", "stripe_customer_id,subscription_status,beta_access,plan");
  const response = await fetch(url, {
    headers: {
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
    },
  });
  if (!response.ok) throw new Error(`Could not read billing profile (${response.status}).`);
  return (await response.json())[0] || null;
}

export async function stripePost(path: string, params: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") || ""}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Stripe request failed.");
  return result;
}

export const priceVariables: Record<string, string> = {
  keeper_month: "STRIPE_PRICE_KEEPER_MONTH",
  keeper_year: "STRIPE_PRICE_KEEPER_YEAR",
  breeder_month: "STRIPE_PRICE_BREEDER_MONTH",
  breeder_year: "STRIPE_PRICE_BREEDER_YEAR",
  pro_month: "STRIPE_PRICE_PRO_MONTH",
  pro_year: "STRIPE_PRICE_PRO_YEAR",
};

export function configuredPrice(tier: string, interval: string) {
  const key = priceVariables[`${tier}_${interval}`];
  return key ? Deno.env.get(key) || "" : "";
}
