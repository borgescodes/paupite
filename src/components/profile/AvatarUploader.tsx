import { useEffect, useRef, useState } from "react";
import { BiCamera } from "react-icons/bi";
import { toast } from "sonner";

import { AvatarCropper } from "@/components/profile/AvatarCropper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
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
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedTypes.has(file.type.toLowerCase()) && !allowedExtensions.has(ext)) {
      toast.error("Formato inválido. Use JPG, PNG, WebP ou HEIC/HEIF.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > maxInputBytes) {
      toast.error("Arquivo muito grande. Envie uma imagem de até 10 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
  }

  async function upload(blob: Blob) {
    if (blob.size > maxOutputBytes) {
      toast.error("A imagem processada excedeu 5 MB. Tente outra foto.");
      return;
    }
    setBusy(true);
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
      toast.error(caught instanceof Error ? caught.message : "Não foi possível atualizar a foto.");
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
        <label
          aria-label="Selecionar nova foto de perfil"
          className="tap-feedback absolute right-0 bottom-1 grid size-11 cursor-pointer place-items-center rounded-2xl border-4 border-background bg-brand text-brand-foreground shadow-lg focus-within:ring-2 focus-within:ring-ring"
        >
          <BiCamera className="size-5" aria-hidden />
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, WebP ou HEIC/HEIF · até 10 MB</p>

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
