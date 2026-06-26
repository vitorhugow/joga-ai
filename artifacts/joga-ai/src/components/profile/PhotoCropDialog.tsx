import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";

const OUTPUT_SIZE = 480;
const PREVIEW_SIZE = 280;

type PhotoCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (croppedDataUrl: string) => void;
};

export function PhotoCropDialog({
  open,
  imageSrc,
  onOpenChange,
  onApply,
}: PhotoCropDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!open || !imageSrc) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [open, imageSrc]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onPointerUp = () => setDragging(false);

  const applyCrop = useCallback(() => {
    if (!imageSrc || !natural.w) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const displayScale =
        Math.max(PREVIEW_SIZE / natural.w, PREVIEW_SIZE / natural.h) * zoom;
      const drawW = natural.w * displayScale;
      const drawH = natural.h * displayScale;

      // Posição do canto superior-esquerdo da imagem no viewport de crop
      const imgLeft = PREVIEW_SIZE / 2 - drawW / 2 + offset.x;
      const imgTop = PREVIEW_SIZE / 2 - drawH / 2 + offset.y;

      // O quadrado visível (0,0)-(PREVIEW_SIZE,PREVIEW_SIZE) em coords da imagem original
      const sx = Math.max(0, -imgLeft / displayScale);
      const sy = Math.max(0, -imgTop / displayScale);
      const sw = Math.min(PREVIEW_SIZE / displayScale, natural.w - sx);
      const sh = Math.min(PREVIEW_SIZE / displayScale, natural.h - sy);

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      onApply(canvas.toDataURL("image/jpeg", 0.88));
      onOpenChange(false);
    };
    img.src = imageSrc;
  }, [imageSrc, natural, offset, onApply, onOpenChange, zoom]);

  if (!imageSrc) return null;

  const displayScale = natural.w
    ? Math.max(PREVIEW_SIZE / natural.w, PREVIEW_SIZE / natural.h) * zoom
    : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0f1a] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Enquadrar foto</DialogTitle>
          <DialogDescription className="text-white/50">
            Arrasta e aproxima até ficar como queres na carta.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto rounded-2xl overflow-hidden touch-none cursor-grab active:cursor-grabbing"
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            border: "2px solid rgba(74,222,128,0.35)",
            boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.25)",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            src={imageSrc}
            alt="Pré-visualização"
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
            style={{
              width: natural.w ? natural.w * displayScale : "auto",
              height: natural.h ? natural.h * displayScale : "auto",
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{ boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.2)" }}
          />
        </div>

        <div className="flex items-center gap-3 mt-2">
          <ZoomOut className="w-4 h-4 text-white/40 shrink-0" />
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-emerald-400"
          />
          <ZoomIn className="w-4 h-4 text-white/40 shrink-0" />
        </div>

        <JogaButton variant="primary" size="lg" className="w-full mt-2" onClick={applyCrop}>
          Aplicar na carta
        </JogaButton>
      </DialogContent>
    </Dialog>
  );
}
