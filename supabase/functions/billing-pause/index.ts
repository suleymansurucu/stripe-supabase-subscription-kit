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

  // pause: true → pause, false → resume
  let body: { pause?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shouldPause = body.pause !== false; // default: pause

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
    .in("status", ["active", "trialing"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    return jsonResponse({ error: subErr.message }, { status: 500 });
  }
  if (!row?.stripe_subscription_id) {
    return jsonResponse({ error: "No active subscription to pause/resume" }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let updated: Stripe.Subscription;
  try {
    if (shouldPause) {
      // Pause: keep invoices as drafts (no charges during pause)
      updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
        pause_collection: { behavior: "keep_as_draft" },
      });
    } else {
      // Resume: clear pause_collection
      updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
        pause_collection: "",
      } as Parameters<typeof stripe.subscriptions.update>[1]);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }

  // Update paused flag in DB
  const { error: upsertErr } = await admin
    .from("subscriptions")
    .update({
      paused: shouldPause,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", row.stripe_subscription_id);

  if (upsertErr) {
    // Non-fatal: DB may not have paused column yet — log and continue
    console.warn("Could not update paused column:", upsertErr.message);
  }

  return jsonResponse({
    stripeSubscriptionId: updated.id,
    status: updated.status,
    paused: shouldPause,
  });
});
