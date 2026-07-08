import { useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { JogaButton, JogaCard } from "@/components/joga";
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
import { Input } from "@/components/ui/input";
import app, { isFirebaseConfigured } from "@/lib/firebase";
import { callableErrorMessage } from "@/lib/callableError";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function DeleteAccountSection() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [forfeitBalance, setForfeitBalance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balanceHint, setBalanceHint] = useState(false);

  async function handleDelete() {
    if (!isFirebaseConfigured()) return;
    setBusy(true);
    try {
      const fn = httpsCallable<
        { confirmForfeitBalance?: boolean },
        { deleted: boolean }
      >(getFunctions(app, "europe-west1"), "deleteMyAccount");
      await fn({ confirmForfeitBalance: forfeitBalance });
      toast({ title: "Conta apagada", description: "Os teus dados foram removidos." });
      setOpen(false);
      await logout();
      setLocation("/entrar");
    } catch (err: unknown) {
      const msg = callableErrorMessage(err, "Não foi possível apagar a conta.");
      const details =
        err && typeof err === "object" && "details" in err
          ? (err as { details?: { reason?: string } }).details
          : undefined;
      if (details?.reason === "BALANCE_REMAINING") {
        setBalanceHint(true);
      }
      toast({ title: "Não foi possível apagar", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <JogaCard variant="arena" className="border-red-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-white text-sm">Zona de perigo</h3>
            <p className="text-white/45 text-xs mt-1 leading-relaxed">
              Apagar a conta remove o perfil, notificações e acesso. Participações passadas ficam
              como «Ex-jogador».
            </p>
            <JogaButton
              variant="ghost"
              size="sm"
              className="mt-3 text-red-400 border border-red-500/30"
              onClick={() => {
                setConfirmText("");
                setForfeitBalance(false);
                setBalanceHint(false);
                setOpen(true);
              }}
            >
              Apagar conta
            </JogaButton>
          </div>
        </div>
      </JogaCard>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="bg-[#0a0f1a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conta permanentemente?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50 space-y-2">
              <span className="block">Esta acção não pode ser desfeita.</span>
              {balanceHint && (
                <span className="block text-amber-300/90">
                  Tens saldo de peladas — marca a opção abaixo se aceitas perdê-lo.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {balanceHint && (
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={forfeitBalance}
                onChange={(e) => setForfeitBalance(e.target.checked)}
              />
              Aceito perder o saldo restante
            </label>
          )}
          <div>
            <p className="text-xs text-white/40 mb-2">Escreve APAGAR para confirmar</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={busy || confirmText !== "APAGAR" || (balanceHint && !forfeitBalance)}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {busy ? "A apagar…" : "Apagar para sempre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
