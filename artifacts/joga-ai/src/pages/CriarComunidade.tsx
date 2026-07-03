import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { createCommunity } from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const GAME_TYPES = [
  { value: "fut7", label: "Fut 7" },
  { value: "fut5", label: "Fut 5" },
  { value: "futsal", label: "Futsal" },
  { value: "futebol11", label: "Fut 11" },
] as const;

export default function CriarComunidade() {
  useDocumentTitle("Criar Comunidade");
  const { userId } = useAuth();
  const { profile } = useUserProfile();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [gameType, setGameType] = useState<(typeof GAME_TYPES)[number]["value"]>("fut7");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast({ title: "Nome obrigatório", description: "Indica o nome da comunidade.", variant: "destructive" });
      return;
    }
    if (city.trim().length < 2) {
      toast({ title: "Cidade obrigatória", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await createCommunity({
        name: name.trim(),
        city: city.trim(),
        gameType,
        isPrivate,
        adminId: userId,
        adminDisplayName: profile.displayName || "Organizador",
      });
      toast({ title: "Comunidade criada!", description: "Já podes convidar a malta." });
      setLocation("/comunidades");
    } catch {
      toast({
        title: "Não foi possível criar",
        description: "Verifica a ligação e tenta outra vez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <JogaPage theme="dark" className="py-5">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/comunidades" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Comunidades</p>
          <h1 className="font-display font-black text-white text-2xl">Criar comunidade</h1>
        </div>
      </div>

      <JogaCard variant="arena" padding="md">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pelada de Sexta"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Cidade</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: Lisboa"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Tipo de jogo</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {GAME_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setGameType(t.value)}
                  className="rounded-xl py-2.5 text-sm font-bold transition-colors"
                  style={
                    gameType === t.value
                      ? {
                          background: "rgba(74,222,128,0.15)",
                          border: "1.5px solid rgba(74,222,128,0.4)",
                          color: "#4ade80",
                        }
                      : {
                          background: "rgba(255,255,255,0.05)",
                          border: "1.5px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.6)",
                        }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 accent-emerald-500"
            />
            <span className="text-white/70 text-sm">Comunidade privada (pedido de entrada)</span>
          </label>
          <JogaButton type="submit" variant="primary" size="lg" className="w-full" disabled={saving}>
            {saving ? "A criar…" : "Criar comunidade"}
          </JogaButton>
        </form>
      </JogaCard>
    </JogaPage>
  );
}
