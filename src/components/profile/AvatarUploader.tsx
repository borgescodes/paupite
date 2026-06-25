import { useEffect, useRef, useState } from "react";
import { BiCamera, BiImageAdd } from "react-icons/bi";
import { toast } from "sonner";

import { AvatarCropper } from "@/components/profile/AvatarCropper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxInputBytes = 10 * 1024 * 1024;
const maxOutputBytes = 5 * 1024 * 1024;

export function AvatarUploader({
  userId,
  name,
  avatarUrl,
  onUploaded,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );

  function cancelCrop() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function choose(file?: File) {
    setError(null);
    if (!file) return;
    if (!allowedTypes.has(file.type)) {
      setError("Formato inválido. Use JPG, JPEG, PNG, WebP ou HEIC/HEIF.");
      return;
    }
    if (file.size > maxInputBytes) {
      setError("A imagem original deve ter no máximo 10 MB.");
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
  }

  async function upload(blob: Blob) {
    if (blob.size > maxOutputBytes) {
      setError("A imagem processada excedeu 5 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    const path = `${userId}/avatar-${Date.now()}.webp`;

    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/webp",
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", userId);
      if (profileError) {
        await supabase.storage.from("avatars").remove([path]);
        throw profileError;
      }

      const oldPath = avatarUrl?.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)?.[1];
      if (oldPath) {
        void supabase.storage.from("avatars").remove([decodeURIComponent(oldPath)]);
      }
      onUploaded(data.publicUrl);
      toast.success("Foto de perfil atualizada.");
      cancelCrop();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha no upload.";
      setError(message);
      toast.error("Não foi possível atualizar a foto.");
    } finally {
      setBusy(false);
    }
  }

  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PP";

  return (
    <div className="space-y-3 text-center">
      <div className="relative mx-auto w-fit">
        <div className="rounded-full bg-gradient-to-br from-brand via-success to-warning p-1 shadow-xl shadow-brand/15">
          <Avatar className="size-28 border-4 border-background sm:size-32">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="bg-brand text-2xl font-extrabold text-brand-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        <label className="tap-feedback absolute right-0 bottom-1 grid size-11 cursor-pointer place-items-center rounded-2xl border-4 border-background bg-brand text-brand-foreground shadow-lg focus-within:ring-2 focus-within:ring-ring">
          <BiCamera className="size-5" />
          <span className="sr-only">Selecionar nova foto</span>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
        <BiImageAdd className="size-5" />
        {avatarUrl ? "Trocar foto" : "Adicionar foto"}
      </Button>
      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP ou HEIC/HEIF · original até 10 MB
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <AvatarCropper
        sourceUrl={sourceUrl}
        open={Boolean(sourceUrl)}
        busy={busy}
        onCancel={cancelCrop}
        onConfirm={(blob) => void upload(blob)}
      />
    </div>
  );
}
