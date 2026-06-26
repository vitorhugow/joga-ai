import { Crown, Check } from "lucide-react";

interface PremiumCardProps {
  title: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

export function PremiumCard({ title, price, period, features, highlighted, badge }: PremiumCardProps) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden border ${highlighted ? "border-amber-300 shadow-lg shadow-amber-100" : "border-gray-200 shadow-sm"}`}
      data-testid="premium-card"
    >
      {highlighted && (
        <div className="bg-linear-to-r from-amber-400 to-yellow-500 px-4 py-1.5 text-center">
          <span className="text-amber-900 font-display font-bold text-xs uppercase tracking-widest">{badge || "Mais Popular"}</span>
        </div>
      )}
      <div className={`px-5 py-5 ${highlighted ? "bg-linear-to-br from-slate-800 to-slate-900" : "bg-white"}`}>
        <div className="flex items-center gap-2 mb-3">
          <Crown className={`w-5 h-5 ${highlighted ? "text-amber-400" : "text-amber-500"}`} />
          <h3 className={`font-display font-bold text-lg ${highlighted ? "text-white" : "text-gray-900"}`}>{title}</h3>
        </div>
        <div className="flex items-baseline gap-1 mb-5">
          <span className={`font-display font-black text-4xl ${highlighted ? "text-white" : "text-gray-900"}`}>{price}</span>
          <span className={`text-sm ${highlighted ? "text-white/60" : "text-gray-400"}`}>/{period}</span>
        </div>
        <div className="space-y-2.5">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${highlighted ? "bg-amber-400" : "bg-emerald-100"}`}>
                <Check className={`w-2.5 h-2.5 ${highlighted ? "text-amber-900" : "text-emerald-700"}`} strokeWidth={3} />
              </div>
              <span className={`text-sm leading-snug ${highlighted ? "text-white/80" : "text-gray-600"}`}>{f}</span>
            </div>
          ))}
        </div>
        <button
          className={`w-full mt-5 py-3 rounded-xl font-display font-bold text-sm active:scale-[0.98] transition-all ${
            highlighted
              ? "bg-linear-to-r from-amber-400 to-yellow-500 text-amber-900 shadow-md"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          data-testid="button-premium-subscribe"
        >
          {highlighted ? "Começar agora" : "Escolher plano"}
        </button>
      </div>
    </div>
  );
}
