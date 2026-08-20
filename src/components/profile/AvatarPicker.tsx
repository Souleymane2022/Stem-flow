import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { Profile } from "@/hooks/useAuth";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Photo de profil : téléversement dans le compartiment `avatars`.
 *
 * Le chemin commence par l'identifiant de l'utilisateur, condition imposée par
 * la politique de stockage — c'est elle qui empêche d'écraser la photo d'un
 * autre, l'interface ne fait que s'y conformer.
 */
export function AvatarPicker({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(t("profile.photo.tooBig"));
      return;
    }
    setBusy(true);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    // Un nom daté évite que le cache du navigateur serve l'ancienne image.
    const path = `${profile.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setBusy(false);
      console.error("[profil] téléversement impossible", uploadError);
      toast.error(t("profile.photo.failed", { reason: uploadError.message }));
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ profile_image_url: data.publicUrl })
      .eq("id", profile.id);
    setBusy(false);
    if (saveError) {
      console.error("[profil] enregistrement de la photo impossible", saveError);
      toast.error(t("profile.photo.saveFailed", { reason: saveError.message }));
      return;
    }
    await onUpdated();
    toast.success(t("profile.photo.updated"));
  };

  return (
    <div className="relative shrink-0">
      {profile.profile_image_url ? (
        <img
          src={profile.profile_image_url}
          alt=""
          className="h-20 w-20 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-brand text-3xl font-black text-primary-foreground">
          {profile.username.charAt(0).toUpperCase()}
        </div>
      )}

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={t("profile.photo.change")}
        className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-gradient-brand text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Réinitialisé pour que choisir deux fois le même fichier déclenche
          // bien un nouvel envoi.
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
