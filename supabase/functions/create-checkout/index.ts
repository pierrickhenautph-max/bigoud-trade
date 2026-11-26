// Crée une session de paiement Stripe (page hébergée par Stripe) pour l'achat unique.
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "not_signed_in" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ent } = await admin.from("entitlements").select("status").eq("user_id", user.id).maybeSingle();
    if (ent && ent.status === "active") return json({ already: true });

    const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "") + "/";
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price]": Deno.env.get("STRIPE_PRICE_ID")!,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      "metadata[user_id]": user.id,
      "payment_intent_data[metadata][user_id]": user.id,
      success_url: site + "?paid=1",
      cancel_url: site + "?paid=0",
    });
    if (user.email) body.set("customer_email", user.email);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + Deno.env.get("STRIPE_SECRET_KEY")!,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const s = await r.json();
    if (!r.ok || !s.url) return json({ error: "stripe_error" }, 502);
    return json({ url: s.url });
  } catch (_e) {
    return json({ error: "server_error" }, 500);
  }
});
