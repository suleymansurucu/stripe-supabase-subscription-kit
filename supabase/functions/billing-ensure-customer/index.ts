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
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return jsonResponse({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.stripe_customer_id) {
    return jsonResponse({
      stripeCustomerId: profile.stripe_customer_id,
      alreadyExisted: true,
    });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const customer = await stripe.customers.create({
    email: profile.email ?? user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return jsonResponse({ error: updateError.message }, { status: 500 });
  }

  return jsonResponse({
    stripeCustomerId: customer.id,
    alreadyExisted: false,
  });
});
