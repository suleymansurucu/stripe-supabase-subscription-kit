import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

async function resolveUserIdForSubscription(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = subscription.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id ?? null;
}

async function resolveUserIdForCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  if (session.client_reference_id) return session.client_reference_id;
  const m = session.metadata?.supabase_user_id;
  return m ?? null;
}

async function upsertSubscriptionForUser(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const row = mapStripeSubscription(subscription, userId);
  const { error } = await admin.from("subscriptions").upsert(row, {
    onConflict: "stripe_subscription_id",
  });
  if (error) throw new Error(error.message);

  if (subscription.trial_start != null) {
    await admin
      .from("profiles")
      .update({
        has_used_trial: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return jsonResponse(
      { error: "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET" },
      500,
    );
  }

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "Missing stripe-signature" }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Webhook signature: ${msg}` }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const payloadSummary = {
    id: event.id,
    type: event.type,
    objectId: (event.data.object as { id?: string })?.id ?? null,
  };

  const { error: insertEvErr } = await admin.from("billing_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: payloadSummary,
  });

  if (insertEvErr) {
    if (insertEvErr.code === "23505") {
      return jsonResponse({ received: true, duplicate: true });
    }
    console.error("billing_events insert", insertEvErr);
    return jsonResponse({ error: insertEvErr.message }, 500);
  }

  const rollbackEventRow = async () => {
    await admin.from("billing_events").delete().eq("stripe_event_id", event.id);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = await resolveUserIdForCheckoutSession(session);
        if (!userId) break;

        const subId = session.subscription;
        if (!subId || typeof subId !== "string") break;

        const subscription = await stripe.subscriptions.retrieve(subId);
        await upsertSubscriptionForUser(admin, subscription, userId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdForSubscription(
          admin,
          stripe,
          subscription,
        );
        if (!userId) break;
        await upsertSubscriptionForUser(admin, subscription, userId);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (!subId) break;

        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = await resolveUserIdForSubscription(
          admin,
          stripe,
          subscription,
        );
        if (!userId) break;
        await upsertSubscriptionForUser(admin, subscription, userId);
        break;
      }

      default:
        break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("webhook handler", event.type, msg);
    await rollbackEventRow();
    return jsonResponse({ error: msg }, 500);
  }

  return jsonResponse({ received: true });
});
