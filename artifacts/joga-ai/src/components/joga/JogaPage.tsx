import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { pageTransition } from "./motion";

type JogaPageTheme = "light" | "arena" | "dark";

interface JogaPageProps {
  theme?: JogaPageTheme;
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  bottomSpace?: boolean;
}

export function JogaPage({
  theme = "light",
  className,
  children,
  padded = true,
  bottomSpace = true,
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
