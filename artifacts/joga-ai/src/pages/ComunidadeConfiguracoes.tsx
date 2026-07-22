import { useCallback, useEffect, useRef, useState } from "react";
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
  isCommunityAdmin,
  isCommunityOrganizerPro,
  addCommunityAdmin,
  removeCommunityAdmin,
  CommunityCoverTooLargeError,
  type Community,
  type CommunityMember,
  type JoinRequest,
} from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { PhotoCropDialog } from "@/components/profile/PhotoCropDialog";
import { ClubCrest } from "@/components/ClubCrest";
import { imageDisplaySrc, resolveCommunityCover } from "@/lib/imageUtils";
import {
  COMMUNITY_COVER_ASPECT,
  COMMUNITY_COVER_LABEL,
  COMMUNITY_COVER_OUTPUT_HEIGHT,
  COMMUNITY_COVER_OUTPUT_WIDTH,
} from "@/lib/communityCover";
import { COMMUNITY_CREST_OUTPUT_SIZE, COMMUNITY_CREST_LABEL } from "@/lib/communityCrest";
import { toast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isOrganizerPro } from "@/lib/entitlements";
import { relinkOrganizerProCommunity } from "@/lib/billing";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { saveCommunityClubSettings } from "@/lib/mensalistaRepository";

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
  const [crestImage, setCrestImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [crestCropSource, setCrestCropSource] = useState<string | null>(null);
  const [crestCropOpen, setCrestCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const crestFileInputRef = useRef<HTMLInputElement>(null);
  const { profile, refresh } = useUserProfile();
  const [proDialogOpen, setProDialogOpen] = useState(false);
  const [mensalistaEnabled, setMensalistaEnabled] = useState(false);
  const [mensalistaPrice, setMensalistaPrice] = useState("10");
  const [mensalistaSlots, setMensalistaSlots] = useState("");
  const [openToExternal, setOpenToExternal] = useState(false);
  const [brandColor, setBrandColor] = useState("#16a34a");
  const [clubSaving, setClubSaving] = useState(false);

  // Clube PRO é uma propriedade da COMUNIDADE (via entitlements do admin
  // principal), não do perfil de quem está a ver — isto é o que permite a um
  // admin adicional ver as features de Clube PRO já desbloqueadas mesmo sem
  // ter entitlements próprios (só o admin principal herda o Jogador PRO
  // pessoal; o Clube PRO em si é partilhado por todos os admins).
  const [orgPro, setOrgPro] = useState(false);
  const relinkAttempted = useRef(false);

  const isAdmin = isCommunityAdmin(community, userId);
  const isPrimaryAdmin = community?.adminId === userId;

  const refreshOrgPro = useCallback(() => {
    if (!id) return;
    void isCommunityOrganizerPro(id).then(setOrgPro);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadCommunity(id, userId).then((c) => {
      if (!c) return;
      setCommunity(c);
      setName(c.name);
      setCity(c.city);
      setGameType(c.gameType);
      setIsPrivate(c.isPrivate);
      setCoverImage(resolveCommunityCover(c) ?? "");
      setCrestImage(c.crestUrl ?? "");
      setMensalistaEnabled(c.mensalista?.enabled === true);
      setMensalistaPrice(
        c.mensalista?.priceCents ? String(c.mensalista.priceCents / 100) : "10",
      );
      setMensalistaSlots(
        c.mensalista?.maxSlots != null ? String(c.mensalista.maxSlots) : "",
      );
      setOpenToExternal(c.openToExternal === true);
      setBrandColor(c.branding?.primaryColor ?? "#16a34a");
    });
    loadCommunityMembers(id).then(setMembers);
    loadPendingJoinRequests(id).then(setPending);
  }, [id, userId]);

  useEffect(() => {
    refreshOrgPro();
  }, [refreshOrgPro]);

  // Auto-reparação: o admin PRINCIPAL tem Clube PRO activo mas não ligado a
  // ESTA comunidade — sintoma de um bug de webhook que apagava o vínculo em
  // renovações. Como cada admin só tem uma subscrição Clube PRO de cada vez,
  // realinha automaticamente em vez de deixar a conta "presa" a ver a
  // feature como bloqueada.
  useEffect(() => {
    if (!isPrimaryAdmin || !id || relinkAttempted.current) return;
    if (orgPro || !isOrganizerPro(profile?.entitlements)) return;

    relinkAttempted.current = true;
    void relinkOrganizerProCommunity(id).then((relinked) => {
      if (relinked) {
        void refresh();
        refreshOrgPro();
      }
    });
  }, [isPrimaryAdmin, id, orgPro, profile?.entitlements, refresh, refreshOrgPro]);

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
        <p className="text-white/50">Apenas o administrador pode configurar este clube.</p>
        <Link href={`/comunidades/${id}`} className="text-emerald-400 text-sm mt-4 inline-block">Voltar</Link>
      </JogaPage>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const coverToSave = coverImage || undefined;
      const crestToSave = crestImage || undefined;
      await updateCommunity(
        id,
        { name, city, gameType, isPrivate, coverImage: coverToSave, crestImage: crestToSave },
        { actorUserId: userId },
      );
      const refreshed = await loadCommunity(id, userId);
      if (refreshed) {
        setCommunity(refreshed);
        setCoverImage(resolveCommunityCover(refreshed) ?? "");
        setCrestImage(refreshed.crestUrl ?? "");
      }
      toast({ title: "Clube actualizado" });
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

  function handleCrestFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Escolhe uma imagem (JPG, PNG ou WebP).", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCrestCropSource(reader.result as string);
      setCrestCropOpen(true);
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
    if (!window.confirm("Apagar este clube? Esta acção não pode ser desfeita.")) return;
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
            <label className="text-[10px] font-bold uppercase text-white/40">Capa do clube</label>
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
            cropDescription={`Ajusta como no banner do clube (${COMMUNITY_COVER_LABEL}).`}
            applyLabel="Aplicar capa"
            onApply={(dataUrl) => {
              setCoverImage(dataUrl);
              setCropOpen(false);
              setCropSource(null);
            }}
          />

          <div>
            <label className="text-[10px] font-bold uppercase text-white/40">Escudo do clube</label>
            <p className="text-white/35 text-xs mt-1 mb-2">
              Imagem quadrada: <span className="text-emerald-300/90 font-semibold">{COMMUNITY_CREST_LABEL}</span>
            </p>
            <div className="flex items-center gap-3">
              <ClubCrest name={name || community.name} crestUrl={crestImage} size={64} />
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={crestFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCrestFileChange}
                />
                <JogaButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => crestFileInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                  Carregar escudo
                </JogaButton>
                {crestImage && (
                  <button
                    type="button"
                    className="text-xs text-red-300"
                    onClick={() => setCrestImage("")}
                  >
                    Remover escudo
                  </button>
                )}
              </div>
            </div>
          </div>
          <PhotoCropDialog
            open={crestCropOpen}
            onOpenChange={setCrestCropOpen}
            imageSrc={crestCropSource}
            outputWidth={COMMUNITY_CREST_OUTPUT_SIZE}
            outputHeight={COMMUNITY_CREST_OUTPUT_SIZE}
            jpegQuality={0.85}
            cropTitle="Enquadrar escudo"
            cropDescription={`Ajusta o escudo (${COMMUNITY_CREST_LABEL}).`}
            applyLabel="Aplicar escudo"
            onApply={(dataUrl) => {
              setCrestImage(dataUrl);
              setCrestCropOpen(false);
              setCrestCropSource(null);
            }}
          />

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-emerald-500" />
            Clube privado
          </label>
          <JogaButton type="submit" variant="primary" disabled={saving}>{saving ? "A guardar…" : "Guardar"}</JogaButton>
        </form>
      </JogaCard>

      <JogaCard variant="arena" padding="md">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-display font-black text-white text-lg">Clube PRO</h2>
          <ProFeatureBadge tier="organizer" />
        </div>
        {!orgPro ? (
          <div className="text-center py-4">
            <p className="text-white/50 text-sm mb-3">Mensalistas, peladas públicas e branding do clube.</p>
            <JogaButton variant="gold" size="sm" onClick={() => setProDialogOpen(true)}>
              Desbloquear Clube PRO
            </JogaButton>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={mensalistaEnabled}
                onChange={(e) => setMensalistaEnabled(e.target.checked)}
                className="accent-emerald-500"
              />
              Activar passe mensal (mensalistas)
            </label>
            {mensalistaEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-white/40">Preço/mês (€)</label>
                  <input
                    type="number"
                    min={5}
                    step={0.5}
                    value={mensalistaPrice}
                    onChange={(e) => setMensalistaPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl px-3 py-2 bg-white/6 border border-white/10 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-white/40">Vagas (opcional)</label>
                  <input
                    type="number"
                    min={1}
                    value={mensalistaSlots}
                    onChange={(e) => setMensalistaSlots(e.target.value)}
                    placeholder="∞"
                    className="mt-1 w-full rounded-xl px-3 py-2 bg-white/6 border border-white/10 text-white text-sm"
                  />
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={openToExternal}
                onChange={(e) => setOpenToExternal(e.target.checked)}
                className="accent-emerald-500"
              />
              Peladas visíveis no Encontrar Jogos (não-membros)
            </label>
            <div>
              <label className="text-[10px] font-bold uppercase text-white/40">Cor do clube</label>
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl cursor-pointer"
              />
            </div>
            <JogaButton
              variant="primary"
              size="sm"
              disabled={clubSaving}
              onClick={() => void (async () => {
                setClubSaving(true);
                try {
                  const priceCents = Math.round(parseFloat(mensalistaPrice.replace(",", ".")) * 100);
                  await saveCommunityClubSettings({
                    communityId: id,
                    mensalista: {
                      enabled: mensalistaEnabled,
                      priceCents: mensalistaEnabled ? priceCents : 0,
                      maxSlots: mensalistaSlots ? Number(mensalistaSlots) : null,
                    },
                    openToExternal,
                    branding: { primaryColor: brandColor },
                  });
                  const refreshed = await loadCommunity(id, userId);
                  if (refreshed) setCommunity(refreshed);
                  toast({ title: "Definições Clube PRO guardadas" });
                } catch (err) {
                  toast({
                    title: "Erro ao guardar",
                    description: err instanceof Error ? err.message : "Tenta novamente.",
                    variant: "destructive",
                  });
                } finally {
                  setClubSaving(false);
                }
              })()}
            >
              {clubSaving ? "A guardar…" : "Guardar Clube PRO"}
            </JogaButton>
          </div>
        )}
        <ProUpgradeDialog
          open={proDialogOpen}
          onOpenChange={setProDialogOpen}
          tier="organizer"
          featureTitle="Clube PRO"
          featureDescription="Mensalistas, peladas públicas e branding exclusivo."
        />
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
        <p className="text-white/40 text-xs mb-3 leading-relaxed">
          Admins adicionais têm os mesmos poderes de gestão, mas só o admin principal
          ({community.adminId === userId ? "tu" : "quem criou o clube"}) herda o Jogador PRO
          pessoal do Clube PRO.
        </p>
        <div className="space-y-2">
          {members.map((m) => {
            const isPrimary = m.userId === community.adminId;
            const isSecondaryAdmin = m.role === "admin" && !isPrimary;
            return (
              <div key={m.userId} className="flex items-center justify-between gap-2">
                <span className="text-white text-sm">
                  {m.displayName} {isPrimary ? "(Admin principal)" : isSecondaryAdmin ? "(Admin)" : ""}
                </span>
                <div className="flex gap-2 shrink-0">
                  {isAdmin && !isPrimary && !isSecondaryAdmin && (
                    <JogaButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void addCommunityAdmin(id, m.userId, userId!)
                          .then(() => loadCommunityMembers(id).then(setMembers))
                          .catch((err) => toast({ title: err instanceof Error ? err.message : "Erro", variant: "destructive" }))
                      }
                    >
                      Tornar admin
                    </JogaButton>
                  )}
                  {isAdmin && isSecondaryAdmin && (
                    <JogaButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void removeCommunityAdmin(id, m.userId, userId!)
                          .then(() => loadCommunityMembers(id).then(setMembers))
                          .catch((err) => toast({ title: err instanceof Error ? err.message : "Erro", variant: "destructive" }))
                      }
                    >
                      Remover admin
                    </JogaButton>
                  )}
                  {!isPrimary && !isSecondaryAdmin && (
                    <JogaButton size="sm" variant="ghost" onClick={() => void removeCommunityMember(id, m.userId).then(() => loadCommunityMembers(id).then(setMembers))}>
                      Remover
                    </JogaButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </JogaCard>

      <JogaButton variant="danger" size="lg" className="w-full gap-2" onClick={() => void handleDeleteCommunity()}>
        <Trash2 className="w-4 h-4" />
        Apagar clube
      </JogaButton>
    </JogaPage>
  );
}
