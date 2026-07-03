import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronLeft, Trash2, Camera } from "lucide-react";
import {
  loadCommunity,
  loadCommunityMembers,
  loadPendingJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateCommunity,
  removeCommunityMember,
  deleteCommunity,
  CommunityCoverTooLargeError,
  type Community,
  type CommunityMember,
  type JoinRequest,
} from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { PhotoCropDialog } from "@/components/profile/PhotoCropDialog";
import { imageDisplaySrc, compressDataUrlToMaxBytes } from "@/lib/imageUtils";
import {
  COMMUNITY_COVER_ASPECT,
  COMMUNITY_COVER_LABEL,
  COMMUNITY_COVER_OUTPUT_HEIGHT,
  COMMUNITY_COVER_OUTPUT_WIDTH,
} from "@/lib/communityCover";
import { MAX_PROFILE_PHOTO_BYTES } from "@/lib/userRepository";
import { toast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const GAME_TYPES = [
  { value: "fut7", label: "Fut 7" },
  { value: "fut5", label: "Fut 5" },
  { value: "futsal", label: "Futsal" },
  { value: "futebol11", label: "Fut 11" },
] as const;

export default function ComunidadeConfiguracoes() {
  const { userId } = useAuth();
  const [, params] = useRoute("/comunidades/:id/configuracoes");
  const id = params?.id || "";

  const [community, setCommunity] = useState<Community | null>(null);
  useDocumentTitle(community ? `Configurações · ${community.name}` : "Configurações");
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [pending, setPending] = useState<JoinRequest[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [gameType, setGameType] = useState<(typeof GAME_TYPES)[number]["value"]>("fut7");
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverImage, setCoverImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = community?.adminId === userId;

  useEffect(() => {
    if (!id) return;
    loadCommunity(id, userId).then((c) => {
      if (!c) return;
      setCommunity(c);
      setName(c.name);
      setCity(c.city);
      setGameType(c.gameType);
      setIsPrivate(c.isPrivate);
      setCoverImage(c.coverImage ?? "");
    });
    loadCommunityMembers(id).then(setMembers);
    loadPendingJoinRequests(id).then(setPending);
  }, [id, userId]);

  if (!community) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar…</p>
      </JogaPage>
    );
  }

  if (!isAdmin) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">Apenas o administrador pode configurar esta comunidade.</p>
        <Link href={`/comunidades/${id}`} className="text-emerald-400 text-sm mt-4 inline-block">Voltar</Link>
      </JogaPage>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let coverToSave = coverImage || undefined;
      if (coverToSave?.startsWith("data:")) {
        coverToSave = await compressDataUrlToMaxBytes(coverToSave, MAX_PROFILE_PHOTO_BYTES);
      }
      await updateCommunity(id, { name, city, gameType, isPrivate, coverImage: coverToSave });
      const refreshed = await loadCommunity(id, userId);
      if (refreshed) {
        setCommunity(refreshed);
        setCoverImage(refreshed.coverImage ?? "");
      }
      toast({ title: "Comunidade actualizada" });
    } catch (err) {
      if (err instanceof CommunityCoverTooLargeError) {
        toast({ title: err.message, variant: "destructive" });
      } else {
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        toast({ title: "Erro ao guardar", description: message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCoverFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Escolhe uma imagem (JPG, PNG ou WebP).", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function handleApprove(req: JoinRequest) {
    try {
      await approveJoinRequest(id, req.userId, req.displayName);
      setPending((p) => p.filter((r) => r.userId !== req.userId));
      loadCommunityMembers(id).then(setMembers);
      toast({ title: `${req.displayName} aprovado` });
    } catch {
      toast({ title: "Erro ao aprovar", variant: "destructive" });
    }
  }

  async function handleReject(req: JoinRequest) {
    try {
      await rejectJoinRequest(id, req.userId);
      setPending((p) => p.filter((r) => r.userId !== req.userId));
      toast({ title: "Pedido recusado" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  }

  async function handleDeleteCommunity() {
    if (!window.confirm("Apagar esta comunidade? Esta acção não pode ser desfeita.")) return;
    try {
      await deleteCommunity(id);
      window.location.href = "/comunidades";
    } catch {
      toast({ title: "Erro ao apagar", variant: "destructive" });
    }
  }

  return (
    <JogaPage theme="dark" className="py-5 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/comunidades/${id}`} className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Admin</p>
          <h1 className="font-display font-black text-white text-2xl">Configurações</h1>
        </div>
      </div>

      <JogaCard variant="arena" padding="md">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase text-white/40">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl px-4 py-3 bg-white/6 border border-white/10 text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-white/40">Cidade</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-xl px-4 py-3 bg-white/6 border border-white/10 text-white text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-white/40">Capa da comunidade</label>
            <p className="text-white/35 text-xs mt-1 mb-2">
              Tamanho ideal: <span className="text-emerald-300/90 font-semibold">{COMMUNITY_COVER_LABEL}</span> (proporção do banner)
            </p>
            <div className="w-full max-w-[390px] h-44 rounded-2xl overflow-hidden border border-white/10 bg-white/6 mb-3">
              {coverImage ? (
                <img src={imageDisplaySrc(coverImage)} alt="Pré-visualização da capa" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/25 text-xs gap-1">
                  <span>Pré-visualização do banner</span>
                  <span className="text-[10px] text-white/20">390 × 176 px no telemóvel</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverFileChange}
                />
                <JogaButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                  Carregar imagem
                </JogaButton>
                {coverImage && (
                  <button
                    type="button"
                    className="text-xs text-red-300"
                    onClick={() => setCoverImage("")}
                  >
                    Remover capa
                  </button>
                )}
            </div>
          </div>
          <PhotoCropDialog
            open={cropOpen}
            onOpenChange={setCropOpen}
            imageSrc={cropSource}
            aspectRatio={COMMUNITY_COVER_ASPECT}
            outputWidth={COMMUNITY_COVER_OUTPUT_WIDTH}
            outputHeight={COMMUNITY_COVER_OUTPUT_HEIGHT}
            jpegQuality={0.78}
            cropTitle="Enquadrar capa"
            cropDescription={`Ajusta como no banner da comunidade (${COMMUNITY_COVER_LABEL}).`}
            applyLabel="Aplicar capa"
            onApply={(dataUrl) => {
              void compressDataUrlToMaxBytes(dataUrl, MAX_PROFILE_PHOTO_BYTES).then((compressed) => {
                setCoverImage(compressed);
                setCropOpen(false);
                setCropSource(null);
              });
            }}
          />
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-emerald-500" />
            Comunidade privada
          </label>
          <JogaButton type="submit" variant="primary" disabled={saving}>{saving ? "A guardar…" : "Guardar"}</JogaButton>
        </form>
      </JogaCard>

      {pending.length > 0 && (
        <JogaCard variant="arena" padding="md">
          <h2 className="font-display font-black text-white text-lg mb-3">Pedidos pendentes</h2>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.userId} className="flex items-center justify-between gap-2">
                <span className="text-white text-sm">{req.displayName}</span>
                <div className="flex gap-2">
                  <JogaButton size="sm" variant="primary" onClick={() => void handleApprove(req)}>Aprovar</JogaButton>
                  <JogaButton size="sm" variant="ghost" onClick={() => void handleReject(req)}>Recusar</JogaButton>
                </div>
              </div>
            ))}
          </div>
        </JogaCard>
      )}

      <JogaCard variant="arena" padding="md">
        <h2 className="font-display font-black text-white text-lg mb-3">Membros ({members.length})</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between">
              <span className="text-white text-sm">{m.displayName} {m.role === "admin" ? "(Admin)" : ""}</span>
              {m.role !== "admin" && (
                <JogaButton size="sm" variant="ghost" onClick={() => void removeCommunityMember(id, m.userId).then(() => loadCommunityMembers(id).then(setMembers))}>
                  Remover
                </JogaButton>
              )}
            </div>
          ))}
        </div>
      </JogaCard>

      <JogaButton variant="danger" size="lg" className="w-full gap-2" onClick={() => void handleDeleteCommunity()}>
        <Trash2 className="w-4 h-4" />
        Apagar comunidade
      </JogaButton>
    </JogaPage>
  );
}
