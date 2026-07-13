import { useState } from "react";
import { FieldTypeIllustration } from "@/components/FieldTypeIllustration";
import { fieldPhotoSrc, FIELD_PHOTO_SIZE } from "@/lib/fieldTypePhotos";

type Props = {
  fieldType?: string | null;
  className?: string;
};

/** Quadrado fixo com foto do tipo de campo no início do card. */
export function FieldTypePhoto({ fieldType, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const src = fieldPhotoSrc(fieldType);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-[#0a0f1a] ${className}`}
      style={{ width: FIELD_PHOTO_SIZE, height: FIELD_PHOTO_SIZE }}
      data-testid="field-photo"
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-emerald-950/50">
          <FieldTypeIllustration fieldType={fieldType ?? undefined} compact />
        </div>
      ) : (
        <img
          src={src}
          alt=""
          loading="eager"
          decoding="async"
          className="block h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
