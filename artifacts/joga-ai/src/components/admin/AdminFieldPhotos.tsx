import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { JogaButton } from "@/components/joga";
import { PhotoCropDialog } from "@/components/profile/PhotoCropDialog";
import { FieldTypePhoto } from "@/components/FieldTypePhoto";
import { toast } from "@/hooks/use-toast";
import { adminSaveFieldPhoto } from "@/lib/adminRepository";
import {
  FIELD_PHOTO_LABELS,
  type FieldPhotoKey,
  type FieldPhotosConfig,
  invalidateFieldPhotosCache,
} from "@/lib/fieldPhotosConfig";
import { useFieldPhotos } from "@/hooks/useFieldPhotos";
import { uploadFieldPhoto } from "@/lib/imageStorage";

const KEYS: FieldPhotoKey[] = ["futsal", "f5", "f7"];

export function AdminFieldPhotos({ disabled }: { disabled?: boolean }) {
  const { config, refresh } = useFieldPhotos();
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<FieldPhotoKey | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker(key: FieldPhotoKey) {
    setActiveKey(key);
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeKey) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function onCropApply(croppedDataUrl: string) {
    if (!activeKey) return;
    setBusy(true);
    try {
      const url = await uploadFieldPhoto(activeKey, croppedDataUrl);
      await adminSaveFieldPhoto(activeKey, url);
      invalidateFieldPhotosCache();
      await refresh();
      toast({ title: "Foto actualizada", description: FIELD_PHOTO_LABELS[activeKey] });
    } catch (err) {
      console.warn("[AdminFieldPhotos]", err);
      toast({
        title: "Erro ao guardar foto",
        description: "Verifica ligação e permissões de admin.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setCropSrc(null);
      setActiveKey(null);
    }
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div>
        <h2 className="font-display font-black text-white text-lg">Fotos dos campos</h2>
        <p className="text-white/45 text-xs mt-1 leading-relaxed">
          Carrega aqui — fica no Firebase instantaneamente, sem pastas nem deploy.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <div key={key} className="space-y-2 text-center">
            <FieldTypePhoto
              fieldType={key === "f5" ? "fut5" : key === "f7" ? "fut7" : "futsal"}
              overrideConfig={config}
            />
            <p className="text-[10px] font-bold uppercase text-white/50">{FIELD_PHOTO_LABELS[key]}</p>
            <JogaButton
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-xs"
              disabled={disabled || busy}
              onClick={() => openPicker(key)}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {config[key] ? "Trocar" : "Carregar"}
            </JogaButton>
          </div>
        ))}
      </div>

      <PhotoCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        onOpenChange={(open) => {
          if (!open) {
            setCropSrc(null);
            setActiveKey(null);
          }
        }}
        onApply={(url) => void onCropApply(url)}
        aspectRatio={1}
        outputSize={512}
        applyLabel="Guardar foto"
        cropTitle="Enquadrar foto do campo"
        cropDescription="Arrasta e aproxima — o quadrado é o que aparece nos cartões."
      />
    </div>
  );
}
