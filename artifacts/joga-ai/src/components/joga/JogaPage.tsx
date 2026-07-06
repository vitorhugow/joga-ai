import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { pageTransition } from "./motion";
import { GeniCredit } from "@/components/SponsorSlot";

type JogaPageTheme = "light" | "arena" | "dark";

interface JogaPageProps {
  theme?: JogaPageTheme;
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  bottomSpace?: boolean;
  /** Esconde o rodapé "Feito pela Geni AI" (ex.: ecrãs cheios como Ao Vivo em modo foco) */
  hideFooterCredit?: boolean;
}

export function JogaPage({
  theme = "light",
  className,
  children,
  padded = true,
  bottomSpace = true,
  hideFooterCredit = false,
}: JogaPageProps) {
  return (
    <motion.div
      className={cn(
        "min-h-screen",
        theme === "light" && "joga-page-light",
        theme === "arena" && "joga-page-arena",
        theme === "dark" && "joga-page-dark",
        bottomSpace && "pb-24",
        padded && "px-4",
        className
      )}
      {...pageTransition}
    >
      {children}
      {!hideFooterCredit && (
        <div className="text-center pt-6 pb-2">
          <GeniCredit />
        </div>
      )}
    </motion.div>
  );
}

interface JogaHeroProps {
  theme?: "pitch" | "arena" | "gold";
  className?: string;
  children: React.ReactNode;
}

export function JogaHero({ theme = "pitch", className, children }: JogaHeroProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        theme === "pitch" && "joga-hero-pitch",
        theme === "arena" && "joga-hero-arena",
        theme === "gold" && "joga-hero-gold",
        className
      )}
    >
      {children}
    </div>
  );
}
