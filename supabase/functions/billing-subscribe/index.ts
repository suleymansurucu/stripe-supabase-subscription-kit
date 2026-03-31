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
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405 },
    );
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

  let body: { priceId?: string; paymentMethodId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const priceId = body.priceId;
  // Optional: pre-confirmed payment method from custom UI (SetupIntent flow)
  const paymentMethodId = body.paymentMethodId ?? null;
  if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
    return jsonResponse({ error: "Invalid or disallowed priceId" }, { status: 400 });
  }

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

  const { data: blocking } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("cancel_at_period_end", false)
    .in("status", ["active", "trialing"])
    .limit(1)
    .maybeSingle();

  if (blocking) {
    return jsonResponse(
      { error: "Already has an active or trialing subscription" },
      { status: 409 },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, stripe_customer_id, has_used_trial")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return jsonResponse({ error: "Profile not found" }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    const { error: cuErr } = await admin
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (cuErr) {
      return jsonResponse({ error: cuErr.message }, { status: 500 });
    }
  }

  const useTrial = !profile.has_used_trial;
  const createParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.payment_intent"],
  };
  if (useTrial) {
    createParams.trial_period_days = 15;
  }
  // If a payment method was confirmed via custom UI (SetupIntent), use it as default
  if (paymentMethodId) {
    createParams.default_payment_method = paymentMethodId;
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create(createParams);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }

  const row = mapStripeSubscription(subscription, user.id);
  const { error: upsertError } = await admin.from("subscriptions").upsert(row, {
    onConflict: "stripe_subscription_id",
  });

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, { status: 500 });
  }

  if (useTrial) {
    await admin
      .from("profiles")
      .update({
        has_used_trial: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  let paymentIntentClientSecret: string | null = null;
  const inv = subscription.latest_invoice;
  if (inv && typeof inv !== "string") {
    const pi = inv.payment_intent;
    if (pi && typeof pi !== "string" && pi.client_secret) {
      paymentIntentClientSecret = pi.client_secret;
    }
  }

  return jsonResponse({
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    paymentIntentClientSecret,
    usedTrial: useTrial,
  });
});
