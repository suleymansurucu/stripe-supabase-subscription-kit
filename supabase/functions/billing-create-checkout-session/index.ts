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

  const successUrl = Deno.env.get("CHECKOUT_SUCCESS_URL");
  const cancelUrl = Deno.env.get("CHECKOUT_CANCEL_URL");
  if (!successUrl || !cancelUrl) {
    return jsonResponse(
      {
        error: "Missing CHECKOUT_SUCCESS_URL or CHECKOUT_CANCEL_URL",
        hint:
          "Supabase Edge Secrets: CHECKOUT_SUCCESS_URL must include literal {CHECKOUT_SESSION_ID}, e.g. https://localhost:5173/billing?session_id={CHECKOUT_SESSION_ID}",
      },
      { status: 500 },
    );
  }
  if (!successUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return jsonResponse(
      {
        error: "CHECKOUT_SUCCESS_URL must contain {CHECKOUT_SESSION_ID}",
      },
      { status: 500 },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization" }, { status: 401 });
  }

  let body: { priceId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const priceId = body.priceId;
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(useTrial ? { trial_period_days: 15 } : {}),
        metadata: { supabase_user_id: user.id },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    });

    return jsonResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
      usedTrialOffer: useTrial,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }
});
