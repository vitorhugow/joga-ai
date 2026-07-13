import { useCallback, useEffect, useState } from "react";
import {
  type FieldPhotosConfig,
  invalidateFieldPhotosCache,
  loadFieldPhotos,
} from "@/lib/fieldPhotosConfig";

export function useFieldPhotos() {
  const [config, setConfig] = useState<FieldPhotosConfig>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    invalidateFieldPhotosCache();
    const next = await loadFieldPhotos();
    setConfig(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadFieldPhotos().then((next) => {
      if (!cancelled) {
        setConfig(next);
        setLoading(false);
      }
    });
    const onUpdate = () => {
      void refresh();
    };
    window.addEventListener("field-photos-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("field-photos-updated", onUpdate);
    };
  }, [refresh]);

  return { config, loading, refresh };
}
