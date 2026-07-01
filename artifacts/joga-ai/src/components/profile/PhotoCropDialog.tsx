import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";

const OUTPUT_SIZE = 400;
const PREVIEW_MAX = 320;

type PhotoCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (croppedDataUrl: string) => void;
  outputSize?: number;
  outputWidth?: number;
  outputHeight?: number;
  aspectRatio?: number;
  jpegQuality?: number;
  applyLabel?: string;
  cropTitle?: string;
  cropDescription?: string;
};

export function PhotoCropDialog({
  open,
  imageSrc,
  onOpenChange,
  onApply,
  outputSize = OUTPUT_SIZE,
  outputWidth,
  outputHeight,
  aspectRatio = 1,
  jpegQuality = 0.82,
  applyLabel = "Aplicar na carta",
  cropTitle = "Enquadrar foto",
  cropDescription = "Arrasta e aproxima até ficar como queres.",
}: PhotoCropDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const preview = useMemo(() => {
    const ratio = aspectRatio > 0 ? aspectRatio : 1;
    if (ratio >= 1) {
      return { width: PREVIEW_MAX, height: Math.round(PREVIEW_MAX / ratio) };
    }
    return { width: Math.round(PREVIEW_MAX * ratio), height: PREVIEW_MAX };
  }, [aspectRatio]);

  const output = useMemo(() => {
    const outW = outputWidth ?? outputSize;
    const outH = outputHeight ?? Math.round(outW / (aspectRatio > 0 ? aspectRatio : 1));
    return { width: outW, height: outH };
  }, [outputWidth, outputHeight, outputSize, aspectRatio]);

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
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const { width: previewWidth, height: previewHeight } = preview;
      const displayScale =
        Math.max(previewWidth / natural.w, previewHeight / natural.h) * zoom;
      const drawW = natural.w * displayScale;
      const drawH = natural.h * displayScale;

      const imgLeft = previewWidth / 2 - drawW / 2 + offset.x;
      const imgTop = previewHeight / 2 - drawH / 2 + offset.y;

      const sx = Math.max(0, -imgLeft / displayScale);
      const sy = Math.max(0, -imgTop / displayScale);
      const sw = Math.min(previewWidth / displayScale, natural.w - sx);
      const sh = Math.min(previewHeight / displayScale, natural.h - sy);

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, output.width, output.height);

      onApply(canvas.toDataURL("image/jpeg", jpegQuality));
      onOpenChange(false);
    };
    img.src = imageSrc;
  }, [imageSrc, natural, offset, onApply, onOpenChange, output, preview, jpegQuality, zoom]);

  if (!imageSrc) return null;

  const displayScale = natural.w
    ? Math.max(preview.width / natural.w, preview.height / natural.h) * zoom
    : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0f1a] border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{cropTitle}</DialogTitle>
          <DialogDescription className="text-white/50">{cropDescription}</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto rounded-2xl overflow-hidden touch-none cursor-grab active:cursor-grabbing"
          style={{
            width: preview.width,
            height: preview.height,
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
          {applyLabel}
        </JogaButton>
      </DialogContent>
    </Dialog>
  );
}
