import { useEffect, useRef, useState } from "react";
import { BiCrop, BiMove, BiReset, BiUpload } from "react-icons/bi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface Point {
  x: number;
  y: number;
}

export function AvatarCropper({
  sourceUrl,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  sourceUrl: string | null;
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ start: Point; origin: Point } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [decodeError, setDecodeError] = useState<string | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDecodeError(null);
  }, [sourceUrl]);

  function cropBounds(nextZoom = zoom) {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };
    const size = viewport.clientWidth;
    const baseScale = Math.max(size / naturalSize.width, size / naturalSize.height);
    return {
      x: Math.max(0, (naturalSize.width * baseScale * nextZoom - size) / 2),
      y: Math.max(0, (naturalSize.height * baseScale * nextZoom - size) / 2),
    };
  }

  function clampOffset(point: Point, nextZoom = zoom) {
    const bounds = cropBounds(nextZoom);
    return {
      x: Math.min(bounds.x, Math.max(-bounds.x, point.x)),
      y: Math.min(bounds.y, Math.max(-bounds.y, point.y)),
    };
  }

  function updateZoom(nextZoom: number) {
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    };
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const next = {
      x: dragRef.current.origin.x + event.clientX - dragRef.current.start.x,
      y: dragRef.current.origin.y + event.clientY - dragRef.current.start.y,
    };
    setOffset(clampOffset(next));
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  async function confirm() {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image?.naturalWidth || !image.naturalHeight) {
      setDecodeError("Não foi possível processar esta imagem.");
      return;
    }

    const previewSize = viewport.clientWidth;
    const outputSize = 720;
    const baseScale = Math.max(previewSize / image.naturalWidth, previewSize / image.naturalHeight);
    const renderedScale = baseScale * zoom;
    const outputRatio = outputSize / previewSize;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) {
      setDecodeError("Seu navegador não disponibilizou o recorte da imagem.");
      return;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (previewSize / 2 + offset.x - (image.naturalWidth * renderedScale) / 2) * outputRatio,
      (previewSize / 2 + offset.y - (image.naturalHeight * renderedScale) / 2) * outputRatio,
      image.naturalWidth * renderedScale * outputRatio,
      image.naturalHeight * renderedScale * outputRatio,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Falha ao criar o avatar."))),
        "image/webp",
        0.88,
      );
    });
    onConfirm(blob);
  }

  const previewSize = viewportRef.current?.clientWidth ?? 320;
  const baseScale =
    naturalSize.width && naturalSize.height
      ? Math.max(previewSize / naturalSize.width, previewSize / naturalSize.height)
      : 1;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !busy && onCancel()}>
      <DialogContent className="top-auto bottom-0 max-h-[94vh] max-w-lg translate-y-0 gap-5 overflow-y-auto rounded-t-3xl border-b-0 p-5 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl sm:border-b">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <BiCrop className="size-5 text-brand" />
            Ajustar foto
          </DialogTitle>
          <DialogDescription>
            Arraste para posicionar e use o zoom. O avatar final será quadrado.
          </DialogDescription>
        </DialogHeader>

        {sourceUrl && (
          <div className="space-y-4">
            <div
              ref={viewportRef}
              role="application"
              aria-label="Área de recorte da foto. Arraste para reposicionar."
              className="relative mx-auto aspect-square w-full max-w-[360px] touch-none cursor-move overflow-hidden rounded-3xl bg-muted select-none"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerEnd}
              onPointerCancel={pointerEnd}
            >
              <img
                ref={imageRef}
                src={sourceUrl}
                alt="Prévia da foto selecionada"
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: "50%",
                  top: "50%",
                  width: naturalSize.width ? naturalSize.width * baseScale : "100%",
                  height: naturalSize.height ? naturalSize.height * baseScale : "100%",
                  marginLeft: naturalSize.width
                    ? `${-(naturalSize.width * baseScale) / 2}px`
                    : "-50%",
                  marginTop: naturalSize.height
                    ? `${-(naturalSize.height * baseScale) / 2}px`
                    : "-50%",
                  transformOrigin: "center",
                  transform: `matrix(${zoom}, 0, 0, ${zoom}, ${offset.x}, ${offset.y})`,
                }}
                onLoad={(event) => {
                  setNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                  setDecodeError(null);
                }}
                onError={() =>
                  setDecodeError(
                    "O navegador não conseguiu abrir esta imagem. Para HEIC/HEIF, use JPEG ou WebP.",
                  )
                }
              />
              <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,.28)]" />
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
                <BiMove className="size-4" />
                Arraste a imagem
              </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="avatar-zoom">Zoom</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                >
                  <BiReset className="size-4" />
                  Centralizar
                </Button>
              </div>
              <Slider
                id="avatar-zoom"
                min={1}
                max={3}
                step={0.02}
                value={[zoom]}
                disabled={busy}
                onValueChange={([value]) => updateZoom(value)}
              />
            </div>

            {decodeError && <p className="text-sm text-destructive">{decodeError}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy || Boolean(decodeError) || !naturalSize.width}
            onClick={() => void confirm()}
          >
            <BiUpload className="size-5" />
            {busy ? "Enviando..." : "Usar esta foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
