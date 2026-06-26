import { Users, MapPin, Trophy } from "lucide-react";
import { Link } from "wouter";

interface CommunityCardProps {
  id: string;
  name: string;
  city: string;
  memberCount: number;
  gameType: string;
  coverImage?: string;
  joined?: boolean;
}

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal",
  fut5: "Fut 5",
  fut7: "Fut 7",
  futebol11: "Futebol 11",
};

const gameTypeColor: Record<string, string> = {
  futsal: "bg-purple-100 text-purple-700",
  fut5: "bg-blue-100 text-blue-700",
  fut7: "bg-emerald-100 text-emerald-700",
  futebol11: "bg-amber-100 text-amber-700",
};

export function CommunityCard({ id, name, city, memberCount, gameType, coverImage, joined }: CommunityCardProps) {
  return (
    <Link href={`/comunidades/${id}`} data-testid={`community-card-${id}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 active:scale-[0.98]">
        <div className="relative h-32 bg-linear-to-br from-emerald-400 to-green-700 overflow-hidden">
          {coverImage && (
            <img
              src={`${coverImage}?w=400&h=200&fit=crop`}
              alt={name}
              className="w-full h-full object-cover opacity-70"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
            <h3 className="font-display font-bold text-white text-lg leading-tight drop-shadow-sm">{name}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${gameTypeColor[gameType] || "bg-gray-100 text-gray-700"}`}>
              {gameTypeLabel[gameType] || gameType}
            </span>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-gray-500 text-sm">
              <MapPin className="w-3.5 h-3.5" />
              <span>{city}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 text-sm">
              <Users className="w-3.5 h-3.5" />
              <span>{memberCount} membros</span>
            </div>
          </div>
          <div className={`text-xs font-semibold px-3 py-1 rounded-full ${joined ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-primary text-white"}`}>
            {joined ? "Membro" : "Entrar"}
          </div>
        </div>
      </div>
    </Link>
  );
}
