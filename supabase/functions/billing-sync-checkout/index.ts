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

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId?.startsWith("cs_")) {
    return jsonResponse({ error: "Invalid sessionId" }, { status: 400 });
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

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.status !== "complete") {
    return jsonResponse(
      { error: "Checkout session not complete", status: session.status },
      { status: 400 },
    );
  }

  const refOk =
    session.client_reference_id === user.id ||
    session.metadata?.supabase_user_id === user.id;
  if (!refOk) {
    return jsonResponse({ error: "Session does not belong to this user" }, {
      status: 403,
    });
  }

  const rawSub = session.subscription;
  if (!rawSub) {
    return jsonResponse({ error: "No subscription on session" }, { status: 500 });
  }

  const subscription = typeof rawSub === "string"
    ? await stripe.subscriptions.retrieve(rawSub)
    : (rawSub as Stripe.Subscription);
  const admin = createClient(supabaseUrl, serviceKey);

  const row = mapStripeSubscription(subscription, user.id);
  const { error: upsertError } = await admin.from("subscriptions").upsert(row, {
    onConflict: "stripe_subscription_id",
  });

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, { status: 500 });
  }

  await admin
    .from("profiles")
    .update({
      has_used_trial: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return jsonResponse({
    ok: true,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
  });
});
