import { useState } from "react";
import { Flag, Ban } from "lucide-react";
import { JogaButton } from "@/components/joga";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitReport, type ReportReason, type ReportTargetType } from "@/lib/reportRepository";
import { blockUser, unblockUser } from "@/lib/blockRepository";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "nome_ofensivo", label: "Nome ofensivo" },
  { value: "foto_inapropriada", label: "Foto inapropriada" },
  { value: "comportamento", label: "Comportamento" },
  { value: "spam", label: "Spam" },
  { value: "outro", label: "Outro" },
];

type ReportBlockActionsProps = {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  isBlocked?: boolean;
  onBlockChange?: (blocked: boolean) => void;
};

export function ReportBlockActions({
  targetType,
  targetId,
  targetLabel,
  isBlocked = false,
  onBlockChange,
}: ReportBlockActionsProps) {
  const { userId, isLinked } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("comportamento");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isLinked || !userId || userId === targetId) return null;

  async function handleReport() {
    if (!userId) return;
    setBusy(true);
    try {
      await submitReport({
        reporterId: userId,
        targetType,
        targetId,
        reason,
        details,
      });
      toast({ title: "Denúncia enviada", description: "A equipa vai analisar." });
      setReportOpen(false);
      setDetails("");
    } catch {
      toast({
        title: "Não foi possível enviar",
        description: "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!userId) return;
    setBusy(true);
    try {
      if (isBlocked) {
        await unblockUser(userId, targetId);
        onBlockChange?.(false);
        toast({ title: "Bloqueio removido" });
      } else {
        await blockUser(userId, targetId);
        onBlockChange?.(true);
        toast({ title: "Jogador bloqueado" });
      }
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <JogaButton
          variant="ghost"
          size="sm"
          className="text-white/45 gap-1.5"
          onClick={() => setReportOpen(true)}
        >
          <Flag className="w-3.5 h-3.5" />
          Denunciar
        </JogaButton>
        {targetType === "user" && (
          <JogaButton
            variant="ghost"
            size="sm"
            className="text-white/45 gap-1.5"
            disabled={busy}
            onClick={() => void toggleBlock()}
          >
            <Ban className="w-3.5 h-3.5" />
            {isBlocked ? "Desbloquear" : "Bloquear jogador"}
          </JogaButton>
        )}
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-[#0a0f1a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Denunciar</DialogTitle>
            <DialogDescription className="text-white/50">
              {targetLabel ? `«${targetLabel}»` : "Este conteúdo"} — a denúncia é confidencial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Detalhes (opcional)"
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              className="bg-white/5 border-white/10 text-white min-h-[80px]"
            />
            <JogaButton
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => void handleReport()}
            >
              Enviar denúncia
            </JogaButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
