import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Users, MapPin, Calendar, Trophy, ChevronLeft, Lock } from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { RankingList } from "@/components/RankingList";
import { MatchCard } from "@/components/MatchCard";
import { PlayerMiniCard } from "@/components/PlayerMiniCard";
import { mockData } from "@/data/mockData";
import { calculateOverall } from "@/lib/cardUtils";
import { loadCommunity, loadAvailableMatches, type Community, type MatchListing } from "@/lib/communityRepository";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { JogaButton, JogaCard, JogaChip, JogaPage } from "@/components/joga";

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal", fut5: "Fut 5", fut7: "Fut 7", futebol11: "Futebol 11",
};

const communityDetails: Record<string, { description: string; matchType: string }> = {
  "1": { description: "A maior comunidade de futebol de Lisboa. Jogamos todas as semanas no Parque das Nações.", matchType: "fut7" },
  "2": { description: "Futsal competitivo no Porto. Bem-vindos jogadores de todos os níveis.", matchType: "futsal" },
  "3": { description: "A comunidade mais desportiva de Lisboa. Futebol 11 no campo das Olaias.", matchType: "futebol11" },
};

const mockMembers = [
  { id: "1", name: "Diogo Ferreira", position: "AVA", overall: calculateOverall(mockData.currentPlayer.attributes) },
  ...mockData.players,
];

const rankingGolos = [
  { rank: 1, name: "Bruno Fernandes", position: "MEI", overall: 74, value: 12, valueLabel: "Golos" },
  { rank: 2, name: "Diogo Ferreira", position: "AVA", overall: calculateOverall(mockData.currentPlayer.attributes), value: 8, valueLabel: "Golos" },
  { rank: 3, name: "Rui Patricio", position: "AVA", overall: 62, value: 5, valueLabel: "Golos" },
];

const rankingOverall = [
  { rank: 1, name: "Bruno Fernandes", position: "MEI", overall: 74, value: 74, valueLabel: "Overall" },
  { rank: 2, name: "Pedro Santos", position: "MEI", overall: 70, value: 70, valueLabel: "Overall" },
  { rank: 3, name: "Miguel Costa", position: "GR", overall: 68, value: 68, valueLabel: "Overall" },
];

const rankingNotas = [
  { rank: 1, name: "Pedro Santos", position: "MEI", overall: 70, value: "8.5", valueLabel: "Média" },
  { rank: 2, name: "Bruno Fernandes", position: "MEI", overall: 74, value: "8.2", valueLabel: "Média" },
  { rank: 3, name: "Diogo Ferreira", position: "AVA", overall: calculateOverall(mockData.currentPlayer.attributes), value: "7.8", valueLabel: "Média" },
];

export default function ComunidadePage() {
  const { requireLinked } = useAuthGate();
  const [, params] = useRoute("/comunidades/:id");
  const [activeTab, setActiveTab] = useState<"partidas" | "rankings" | "membros">("partidas");
  const id = params?.id || "1";

  const fallbackCommunity = mockData.communities.find((c) => c.id === id) || mockData.communities[0];
  const [community, setCommunity] = useState<Community>(() => fallbackCommunity as Community);
  const [matches, setMatches] = useState<MatchListing[]>(() => mockData.availableMatches as MatchListing[]);

  // Hidrata do Firestore em background
  useEffect(() => {
    loadCommunity(id).then((c) => { if (c) setCommunity(c); });
    loadAvailableMatches().then(setMatches);
  }, [id]);

  const details = communityDetails[id] || communityDetails["1"];
  const isPrivate = Boolean(community.isPrivate);
  const isMember = community.isMember !== false;
  const hasAccess = !isPrivate || isMember;

  const tabs = [
    { key: "partidas", label: "Partidas" },
    { key: "rankings", label: "Rankings" },
    { key: "membros", label: "Membros" },
  ] as const;

  return (
    <JogaPage theme="dark" padded={false}>
      <div className="relative h-44 joga-hero-arena overflow-hidden">
        {community.coverImage && (
          <img
            src={`${community.coverImage}?w=500&h=200&fit=crop`}
            alt={community.name}
            className="w-full h-full object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
        <Link href="/comunidades" className="joga-tap absolute top-4 left-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/15" data-testid="button-back">
          <ChevronLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="font-display font-bold text-white text-2xl leading-tight drop-shadow-md">{community.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <MapPin className="w-3 h-3" />
              <span>{community.city}</span>
            </div>
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <Users className="w-3 h-3" />
              <span>{community.memberCount} membros</span>
            </div>
            <span className="bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              {gameTypeLabel[community.gameType] || community.gameType}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Description */}
        <p className="text-white/55 text-sm leading-relaxed">{details.description}</p>

        {/* Join Button */}
        <JogaButton
          variant="primary"
          size="lg"
          data-testid="button-join-community"
          onClick={() => requireLinked({
            mode: "register",
            title: "Cria conta para entrar na comunidade",
            description: "Visitantes podem ver a comunidade. Para pedir entrada, regista-te grátis.",
          })}
        >
          {hasAccess ? "Pedir para Entrar" : "Solicitar aprovação"}
        </JogaButton>

        {!hasAccess && (
          <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} data-testid="private-community-locked">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <Lock className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="font-display font-black text-white text-xl">Comunidade Privada</h2>
            <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.48)" }}>
              Envia um pedido de aprovação para veres jogos internos, rankings e estatísticas desta comunidade.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap" style={{ display: hasAccess ? "flex" : "none" }}>
          {tabs.map((tab) => (
            <JogaChip
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              testId={`tab-${tab.key}`}
            />
          ))}
        </div>

        {/* Tab Content */}
        {hasAccess && activeTab === "partidas" && (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard key={m.id} {...m} returnTo={`/comunidades/${id}`} />
            ))}
          </div>
        )}

        {hasAccess && activeTab === "rankings" && (
          <div className="space-y-4">
            <RankingList title="Top Overall" entries={rankingOverall} />
            <RankingList title="Artilheiros" entries={rankingGolos} />
            <RankingList title="Melhores Notas" entries={rankingNotas} />
          </div>
        )}

        {hasAccess && activeTab === "membros" && (
          <div className="space-y-3">
            {mockMembers.map((m) => (
              <JogaCard key={m.id} variant="arena">
                <PlayerMiniCard name={m.name} position={m.position} overall={m.overall} />
              </JogaCard>
            ))}
          </div>
        )}
      </div>
    </JogaPage>
  );
}
