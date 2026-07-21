import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Home, Calendar, Users, Trophy, Award, User } from "lucide-react";
import { subscribeActiveTournamentConfig } from "@/lib/tournamentRepository";

const baseNavItems = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/jogos", icon: Calendar, label: "Jogos" },
  { path: "/comunidades", icon: Users, label: "Comunidades" },
  { path: "/ranking", icon: Trophy, label: "Ranking" },
  { path: "/perfil", icon: User, label: "Perfil" },
];

export function BottomNavigation() {
  const [location] = useLocation();
  const [cupLabel, setCupLabel] = useState<string | null>(null);

  useEffect(() => {
    return subscribeActiveTournamentConfig((config) => setCupLabel(config?.tabLabel ?? null));
  }, []);

  const navItems = cupLabel
    ? [
        baseNavItems[0],
        baseNavItems[1],
        { path: "/cup", icon: Award, label: cupLabel },
        ...baseNavItems.slice(2),
      ]
    : baseNavItems;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom" data-testid="bottom-navigation">
      <div className="max-w-md mx-auto flex items-stretch joga-nav-shell" style={{ height: 68 }}>
        {navItems.map((item) => {
          const isActive =
            location === item.path ||
            (item.path !== "/" && location.startsWith(item.path));
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={item.path}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 group relative cursor-pointer joga-tap"
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {isActive && (
                <motion.div
                  layoutId="joga-nav-pill"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full joga-nav-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <div
                className="flex items-center justify-center w-11 h-7 rounded-xl transition-all duration-200"
                style={isActive ? { background: "rgba(22,163,74,0.15)" } : undefined}
              >
                <Icon
                  className="transition-all duration-200"
                  style={{
                    width: 20,
                    height: 20,
                    color: isActive ? "#4ade80" : "rgba(255,255,255,0.32)",
                    strokeWidth: isActive ? 2.5 : 1.8,
                    transform: isActive ? "scale(1.1)" : "scale(1)",
                  }}
                />
              </div>
              <span
                className="text-[10px] font-bold leading-none transition-colors duration-200"
                style={{ color: isActive ? "#4ade80" : "rgba(255,255,255,0.28)" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
