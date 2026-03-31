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

  if (req.method !== "GET" && req.method !== "POST") {
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
    return jsonResponse({ paymentMethod: null });
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let customer: Stripe.Customer;
  try {
    const c = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (c.deleted) {
      return jsonResponse({ paymentMethod: null });
    }
    customer = c as Stripe.Customer;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, { status: 502 });
  }

  const rawPm = customer.invoice_settings?.default_payment_method;
  let pm: Stripe.PaymentMethod | null = null;

  if (rawPm && typeof rawPm === "object" && (rawPm as Stripe.PaymentMethod).object === "payment_method") {
    pm = rawPm as Stripe.PaymentMethod;
  } else if (typeof rawPm === "string") {
    try {
      pm = await stripe.paymentMethods.retrieve(rawPm);
    } catch {
      pm = null;
    }
  }

  if (!pm?.card) {
    const list = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });
    pm = list.data[0] ?? null;
  }

  if (!pm?.card) {
    return jsonResponse({ paymentMethod: null });
  }

  return jsonResponse({
    paymentMethod: {
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    },
  });
});
