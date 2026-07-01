import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function useJogaConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const normalized: ConfirmOptions =
      typeof opts === "string" ? { description: opts } : opts;

    return new Promise<boolean>((resolve) => {
      setOptions(normalized);
      setResolver(() => resolve);
      setOpen(true);
    });
  }, []);

  function handleClose(result: boolean) {
    setOpen(false);
    resolver?.(result);
    setResolver(null);
    setOptions(null);
  }

  const ConfirmDialog = (
    <AlertDialog open={open} onOpenChange={(next) => !next && handleClose(false)}>
      <AlertDialogContent className="border-white/10 text-white" style={{ background: "#0f172a" }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-white">
            {options?.title ?? "Confirmar"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            {options?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => handleClose(false)}
          >
            {options?.cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              options?.destructive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }
            onClick={() => handleClose(true)}
          >
            {options?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
