import { useEffect, useRef, useState } from "react";
import { Camera, Crop, Upload } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxInputBytes = 10 * 1024 * 1024;

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
  const imageRef = useRef<HTMLImageElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );

  function choose(file?: File) {
    setError(null);
    if (!file) return;
    if (!allowedTypes.has(file.type)) {
      setError("Use JPEG, PNG, WebP ou HEIC.");
      return;
    }
    if (file.size > maxInputBytes) {
      setError("A imagem original deve ter no máximo 10 MB.");
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setZoom(1);
  }

  async function upload() {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) {
      setError(
        "O navegador não conseguiu abrir essa imagem. Para HEIC, converta para JPEG ou WebP.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível.");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Falha ao processar imagem."))),
          "image/webp",
          0.86,
        ),
      );
      if (blob.size > 5 * 1024 * 1024) throw new Error("A imagem processada excedeu 5 MB.");

      const path = `${userId}/avatar-${Date.now()}.webp`;
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
      if (profileError) throw profileError;

      const oldPath = avatarUrl?.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)?.[1];
      if (oldPath) void supabase.storage.from("avatars").remove([decodeURIComponent(oldPath)]);
      onUploaded(data.publicUrl);
      URL.revokeObjectURL(sourceUrl!);
      setSourceUrl(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-center">
      <div className="relative mx-auto w-fit">
        <Avatar className="size-28 border-4 border-background shadow-lg">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="bg-brand text-2xl font-bold text-brand-foreground">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <label className="absolute right-0 bottom-0 grid size-9 cursor-pointer place-items-center rounded-full bg-brand text-brand-foreground shadow">
          <Camera className="size-4" />
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG, WebP ou HEIC · máximo final 5 MB</p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={Boolean(sourceUrl)} onOpenChange={(open) => !open && setSourceUrl(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crop className="size-4" />
              Recortar avatar 1:1
            </DialogTitle>
          </DialogHeader>
          {sourceUrl && (
            <div className="space-y-4">
              <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt="Prévia do recorte"
                  className="size-full object-cover transition-transform"
                  style={{ transform: `scale(${zoom})` }}
                  onError={() =>
                    setError("Não foi possível decodificar a imagem. Tente JPEG, PNG ou WebP.")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Zoom</Label>
                <Slider
                  min={1}
                  max={3}
                  step={0.05}
                  value={[zoom]}
                  onValueChange={([value]) => setZoom(value)}
                />
              </div>
              <Button className="w-full" disabled={busy} onClick={() => void upload()}>
                <Upload className="size-4" />
                {busy ? "Enviando..." : "Usar esta foto"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
