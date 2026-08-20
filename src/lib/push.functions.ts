import { createServerFn } from "@tanstack/react-start";
import webpush from "web-push";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Notifications poussées.
 *
 * La clé publique VAPID est servie par une fonction plutôt que par une
 * variable `VITE_…` : elle n'a pas besoin d'être figée dans le bundle, et la
 * changer ne demande alors pas de reconstruire l'application.
 */
function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    // L'adresse de contact est exigée par la spécification : c'est par elle que
    // le service de push signale un problème.
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:contact@stemflow.app",
  };
}

export const getPushPublicKey = createServerFn({ method: "GET" }).handler(() => {
  return { publicKey: vapid()?.publicKey ?? null };
});

/**
 * Types de message qu'un membre peut déclencher vers un autre.
 *
 * Le texte n'est jamais fourni par l'appelant : il est composé ici à partir du
 * type et du nom de l'expéditeur. Sans cette contrainte, la fonction serait un
 * moyen d'envoyer n'importe quel texte sur le téléphone de n'importe qui.
 */
const KINDS = ["duel", "invite"] as const;
type Kind = (typeof KINDS)[number];

type Input = { userId: string; kind: Kind; url?: string };

function compose(kind: Kind, from: string): { title: string; body: string } {
  if (kind === "duel") {
    return { title: "Un défi t'attend", body: `@${from} te défie sur un cours.` };
  }
  return { title: "Invitation à un salon", body: `@${from} t'invite à sa compétition.` };
}

export const notifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.userId) throw new Error("Destinataire manquant");
    if (!KINDS.includes(input.kind)) throw new Error("Type de notification inconnu");
    // Le lien reste interne : une notification ne doit pas pouvoir emmener
    // ailleurs que dans l'application.
    const url = input.url && input.url.startsWith("/") ? input.url : "/notifications";
    return { userId: input.userId, kind: input.kind, url };
  })
  .handler(async ({ data, context }) => {
    const keys = vapid();
    if (!keys) return { ok: false, sent: 0, reason: "vapid-manquant" as const };
    if (data.userId === context.userId) return { ok: true, sent: 0, reason: "soi-meme" as const };

    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", data.userId);
    if (!subscriptions?.length) return { ok: true, sent: 0, reason: "aucun-appareil" as const };

    const { data: sender } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();

    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const message = compose(data.kind, sender?.username ?? "stemflow");
    const payload = JSON.stringify({ ...message, url: data.url, tag: data.kind });

    let sent = 0;
    const stale: string[] = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 et 410 : l'abonnement a été révoqué côté navigateur. Le garder
        // ferait échouer tous les envois suivants vers cet appareil.
        if (status === 404 || status === 410) stale.push(sub.endpoint);
        else console.error("[push] envoi impossible", status, error);
      }
    }
    if (stale.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
    }

    return { ok: true, sent, reason: null };
  });
