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

  let body: { atPeriodEnd?: boolean } = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") body = raw as { atPeriodEnd?: boolean };
  } catch {
    // empty body ok — default atPeriodEnd true
  }

  const atPeriodEnd = body.atPeriodEnd !== false;

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
    return jsonResponse({ error: "No cancellable subscription" }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let updated: Stripe.Subscription;
  try {
    if (atPeriodEnd) {
      updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    } else {
      updated = await stripe.subscriptions.cancel(row.stripe_subscription_id);
    }
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
    cancelAtPeriodEnd: updated.cancel_at_period_end,
    currentPeriodEnd: updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : null,
  });
});
