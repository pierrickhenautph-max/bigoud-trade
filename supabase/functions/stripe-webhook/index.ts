// Reçoit les événements Stripe, vérifie la signature, enregistre l'achat.
// À déployer SANS vérification JWT (Stripe n'a pas de jeton Supabase).
// Secrets requis : STRIPE_WEBHOOK_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function verify(raw: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  if (!t) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`)));
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const v = p.slice(3);
    if (v.length !== expected.length) return false;
    let d = 0;
    for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return d === 0;
  });
}

Deno.serve(async (req) => {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const ok = await verify(raw, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!).catch(() => false);
  if (!ok) return new Response("bad signature", { status: 400 });

  const ev = JSON.parse(raw);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();

  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const s = ev.data.object;
    const uid = s.client_reference_id || (s.metadata && s.metadata.user_id);
    if (uid && s.payment_status === "paid") {
      const { error } = await admin.from("entitlements").upsert({
        user_id: uid,
        status: "active",
        stripe_session_id: s.id,
        stripe_payment_intent: s.payment_intent ?? null,
        amount: s.amount_total ?? null,
        currency: s.currency ?? null,
        updated_at: now,
      });
      if (error) {
        console.error("entitlements upsert:", JSON.stringify(error));
        return new Response("db error: " + (error.message ?? "") + " | " + (error.code ?? ""), { status: 500 });
      }
    }
  } else if (ev.type === "charge.refunded") {
    const c = ev.data.object;
    if (c.payment_intent && c.refunded) {
      await admin.from("entitlements").update({ status: "refunded", updated_at: now }).eq("stripe_payment_intent", c.payment_intent);
    }
  }
  return new Response("ok", { status: 200 });
});
