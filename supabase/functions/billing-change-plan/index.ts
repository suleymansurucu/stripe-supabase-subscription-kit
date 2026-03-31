import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: unknown,
  init: ResponseInit & { status?: number } = {},
): Response {
  const { status = 200, headers, ...rest } = init;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers,
    },
    ...rest,
  });
}

// TODO: Replace these with your actual Stripe price IDs from the Stripe Dashboard
const ALLOWED_PRICE_IDS = new Set([
  "price_YOUR_SIMPLE_MONTHLY_PRICE_ID",
  "price_YOUR_SIMPLE_YEARLY_PRICE_ID",
  "price_YOUR_PRO_MONTHLY_PRICE_ID",
  "price_YOUR_PRO_YEARLY_PRICE_ID",
]);

function mapStripeSubscription(
  sub: Stripe.Subscription,
  userId: string,
): Record<string, unknown> {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? "";
  return {
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status: sub.status,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_start: sub.trial_start
      ? new Date(sub.trial_start * 1000).toISOString()
      : null,
    trial_end: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return jsonResponse({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization" }, { status: 401 });
  }

  let body: { priceId?: string; prorationBehavior?: "create_prorations" | "none" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const priceId = body.priceId;
  if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
    return jsonResponse({ error: "Invalid or disallowed priceId" }, { status: 400 });
  }

  const prorationBehavior = body.prorationBehavior ?? "create_prorations";

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Invalid session" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: row, error: subErr } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    return jsonResponse({ error: subErr.message }, { status: 500 });
  }
  if (!row?.stripe_subscription_id) {
    return jsonResponse({ error: "No active subscription to change" }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let current: Stripe.Subscription;
  try {
    current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }

  const item = current.items.data[0];
  if (!item?.id) {
    return jsonResponse({ error: "Subscription has no line item" }, { status: 400 });
  }

  if (item.price.id === priceId) {
    return jsonResponse({ error: "Already on this price" }, { status: 409 });
  }

  let updated: Stripe.Subscription;
  try {
    updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: prorationBehavior,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }

  const mapped = mapStripeSubscription(updated, user.id);
  const { error: upsertErr } = await admin.from("subscriptions").upsert(mapped, {
    onConflict: "stripe_subscription_id",
  });
  if (upsertErr) {
    return jsonResponse({ error: upsertErr.message }, { status: 500 });
  }

  return jsonResponse({
    stripeSubscriptionId: updated.id,
    status: updated.status,
    stripePriceId: priceId,
    currentPeriodEnd: updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : null,
  });
});
