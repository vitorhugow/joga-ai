import { useState } from "react";
import { FieldTypeIllustration } from "@/components/FieldTypeIllustration";
import { useFieldPhotos } from "@/hooks/useFieldPhotos";
import {
  FIELD_PHOTO_SIZE,
  resolveFieldPhotoUrl,
  type FieldPhotosConfig,
} from "@/lib/fieldPhotosConfig";

type Props = {
  fieldType?: string | null;
  className?: string;
  /** Pré-visualização no admin sem esperar pelo evento global. */
  overrideConfig?: FieldPhotosConfig;
};

/** Quadrado fixo com foto do tipo de campo (Firebase Storage). */
export function FieldTypePhoto({ fieldType, className = "", overrideConfig }: Props) {
  const { config } = useFieldPhotos();
  const [failed, setFailed] = useState(false);
  const merged = overrideConfig ?? config;
  const src = resolveFieldPhotoUrl(fieldType, merged);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-[#0a0f1a] ${className}`}
      style={{ width: FIELD_PHOTO_SIZE, height: FIELD_PHOTO_SIZE }}
      data-testid="field-photo"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="eager"
          decoding="async"
          className="block h-full w-full object-cover object-center"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-emerald-950/50">
          <FieldTypeIllustration fieldType={fieldType ?? undefined} compact />
        </div>
      )}
    </div>
  );
}
