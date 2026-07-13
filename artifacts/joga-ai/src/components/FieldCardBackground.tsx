import { useState } from "react";
import { useFieldPhotos } from "@/hooks/useFieldPhotos";
import { resolveFieldPhotoUrl } from "@/lib/fieldPhotosConfig";

type Props = {
  fieldType?: string | null;
};

/** Foto do campo como fundo suave do cartão (baixa opacidade + overlay escuro). */
export function FieldCardBackground({ fieldType }: Props) {
  const { config } = useFieldPhotos();
  const [failed, setFailed] = useState(false);
  const src = resolveFieldPhotoUrl(fieldType, config);

  if (!src || failed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-[0.55] blur-[1px]"
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, rgba(10,15,26,0.94) 0%, rgba(10,15,26,0.82) 45%, rgba(10,15,26,0.9) 100%)",
        }}
      />
    </div>
  );
}
