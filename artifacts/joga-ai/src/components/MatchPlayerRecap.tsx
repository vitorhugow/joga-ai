import { JogaCard } from "@/components/joga";

type MatchPlayerRecapProps = {
  playerName: string;
  goals: number;
  assists: number;
  saves?: number;
  rating?: number | null;
};

/** Retrospetiva grátis — números do próprio jogador nesta pelada. */
export function MatchPlayerRecap({
  playerName,
  goals,
  assists,
  saves = 0,
  rating,
}: MatchPlayerRecapProps) {
  return (
    <JogaCard variant="arena">
      <p className="text-emerald-300/80 text-[10px] font-black uppercase tracking-[0.2em]">
        A tua retrospetiva
      </p>
      <p className="font-display font-black text-white text-lg mt-1">{playerName}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="font-display font-black text-white text-xl">{goals}</p>
          <p className="text-[9px] font-black uppercase text-white/40">Golos</p>
        </div>
        <div>
          <p className="font-display font-black text-white text-xl">{assists}</p>
          <p className="text-[9px] font-black uppercase text-white/40">Assist.</p>
        </div>
        <div>
          <p className="font-display font-black text-white text-xl">{saves}</p>
          <p className="text-[9px] font-black uppercase text-white/40">Defesas</p>
        </div>
        <div>
          <p className="font-display font-black text-amber-300 text-xl">
            {rating != null && rating > 0 ? rating.toFixed(1) : "—"}
          </p>
          <p className="text-[9px] font-black uppercase text-white/40">Nota</p>
        </div>
      </div>
    </JogaCard>
  );
}
