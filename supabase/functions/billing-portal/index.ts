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

  const returnUrl = Deno.env.get("BILLING_PORTAL_RETURN_URL");
  if (!returnUrl?.startsWith("http")) {
    return jsonResponse(
      {
        error: "Missing BILLING_PORTAL_RETURN_URL",
        hint:
          "Edge Secret: full URL where Stripe sends the user after the portal, e.g. https://localhost:5173/billing",
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

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) {
    return jsonResponse({ error: pErr.message }, { status: 500 });
  }

  const customerId = profile?.stripe_customer_id;
  if (!customerId) {
    return jsonResponse(
      { error: "No Stripe customer yet; complete checkout or ensure-customer first" },
      { status: 404 },
    );
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return jsonResponse({ portalUrl: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("No configuration provided") ||
      message.includes("customer portal")
    ) {
      return jsonResponse(
        {
          error: message,
          hint:
            "Stripe Dashboard → Settings → Billing → Customer portal — activate and configure products/links.",
        },
        { status: 502 },
      );
    }
    return jsonResponse({ error: message }, { status: 502 });
  }
});
