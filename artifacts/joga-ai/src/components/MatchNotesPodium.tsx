import { PlayerRankingBoard } from "@/components/PlayerRankingBoard";
import { JogaButton } from "@/components/joga";
import type { MatchResult } from "@/lib/matchHistoryRepository";

type MatchNotesPodiumProps = {
  /** true quando watchMatchResult devolveu { ok: false } — erro de leitura, não "sem resultado". */
  hasError: boolean;
  ratingsReleased: boolean;
  matchResult: MatchResult | null;
  /** Re-subscreve o watchMatchResult (usado só no estado de erro). */
  onRetry: () => void;
};

/**
 * Pódio de notas do pós-jogo. Distingue três estados que, antes desta
 * mudança, ficavam indistinguíveis atrás do mesmo "As notas ainda não
 * saíram": um erro de leitura (permissão/rede) e "saíram mas sem votos
 * válidos" pareciam ambos "ainda não saíram" — foi essa confusão, combinada
 * com um bug noutro sítio que zerava notas já publicadas, que fazia o pódio
 * "esquecer" notas reais e ficar preso em "Ainda sem dados para mostrar"
 * para sempre. Os dois locais em PosJogo.tsx que mostram o pódio usam este
 * componente para nunca voltarem a divergir na lógica de decisão.
 */
export function MatchNotesPodium({
  hasError,
  ratingsReleased,
  matchResult,
  onRetry,
}: MatchNotesPodiumProps) {
  if (hasError) {
    return (
      <div className="text-center py-4">
        <p className="text-white/45 text-sm">
          Não foi possível carregar as notas. Verifica a ligação e tenta novamente.
        </p>
        <JogaButton variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </JogaButton>
      </div>
    );
  }

  if (!ratingsReleased || !matchResult) {
    return (
      <p className="text-white/45 text-sm text-center py-4">
        As notas ainda não saíram — aparecem aqui quando o organizador finalizar,
        ou 24h após o fim da pelada.
      </p>
    );
  }

  const entries = [...matchResult.players]
    .filter((p) => p.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .map((p) => ({
      id: p.playerId,
      userId: p.userId,
      name: p.name,
      value: p.rating.toFixed(1),
    }));

  if (entries.length === 0) {
    return (
      <p className="text-white/45 text-sm text-center py-4">
        As notas saíram, mas não há votos suficientes para montar o pódio.
      </p>
    );
  }

  return <PlayerRankingBoard entries={entries} valueLabel="nota" />;
}
