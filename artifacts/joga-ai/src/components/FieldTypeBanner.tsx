import { useState } from "react";
import { fieldPhotoSrc } from "@/lib/fieldTypePhotos";
import { FieldTypeIllustration } from "@/components/FieldTypeIllustration";

type Props = {
  fieldType?: string | null;
  className?: string;
};

/** Banner 16:9 com foto real do tipo de campo; SVG só se a imagem falhar. */
export function FieldTypeBanner({ fieldType, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const src = fieldPhotoSrc(fieldType);

  if (failed) {
    return (
      <div
        className={`relative w-full aspect-video overflow-hidden bg-black/30 flex items-center justify-center ${className}`}
        data-testid="field-banner-fallback"
      >
        <FieldTypeIllustration fieldType={fieldType ?? undefined} />
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-video overflow-hidden ${className}`} data-testid="field-banner">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(10,15,26,0.88) 0%, rgba(10,15,26,0.25) 45%, transparent 100%)",
        }}
        aria-hidden
      />
    </div>
  );
}
