import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

  // GET: Postman / curl. POST: supabase.functions.invoke() defaults to POST — same handler.
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
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
    .select("stripe_customer_id, has_used_trial")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, { status: 500 });
  }

  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    return jsonResponse({ error: subError.message }, { status: 500 });
  }

  return jsonResponse({
    profile: {
      stripeCustomerId: profile?.stripe_customer_id ?? null,
      hasUsedTrial: profile?.has_used_trial ?? false,
    },
    subscription,
  });
});
