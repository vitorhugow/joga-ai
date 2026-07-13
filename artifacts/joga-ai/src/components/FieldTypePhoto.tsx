import { useState } from "react";
import { FieldTypeIllustration } from "@/components/FieldTypeIllustration";
import { fieldPhotoSrc, FIELD_PHOTO_HEIGHT, FIELD_PHOTO_WIDTH } from "@/lib/fieldTypePhotos";

type Props = {
  fieldType?: string | null;
  className?: string;
};

/** Painel fixo com foto do tipo de campo (fundo lateral do card). */
export function FieldTypePhoto({ fieldType, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const src = fieldPhotoSrc(fieldType);

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: FIELD_PHOTO_WIDTH, height: FIELD_PHOTO_HEIGHT }}
      data-testid="field-photo"
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-black/35">
          <FieldTypeIllustration fieldType={fieldType ?? undefined} compact />
        </div>
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,15,26,0.15) 0%, rgba(10,15,26,0.55) 70%, rgba(10,15,26,0.82) 100%)",
        }}
        aria-hidden
      />
    </div>
  );
}
