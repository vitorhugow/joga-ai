import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { JogaButton } from "@/components/joga";
import { JogaLogo } from "@/components/brand";
import { NotificationsBell } from "@/components/NotificationsBell";

interface AppHeaderProps {
  title?: string;
  showLogo?: boolean;
  showBack?: boolean;
  backUrl?: string;
  rightElement?: React.ReactNode;
  showBell?: boolean;
  dark?: boolean;
}

export function AppHeader({ title, showLogo, showBack, backUrl = "/", rightElement, showBell, dark }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full flex items-center justify-between px-4 h-14",
        dark ? "bg-transparent" : "bg-white/90 backdrop-blur-md border-b border-gray-100"
      )}
      data-testid="app-header"
    >
      <div className="flex items-center flex-1 min-w-0">
        {showBack && (
          <Link href={backUrl} data-testid="button-back">
            <JogaButton
              variant={dark ? "ghost" : "outline"}
              size="icon"
              className={cn(!dark && "border-gray-200 bg-white")}
              aria-label="Voltar"
            >
              <ChevronLeft className={cn("w-5 h-5", dark ? "text-white" : "text-gray-700")} />
            </JogaButton>
          </Link>
        )}
        {showLogo ? (
          <JogaLogo variant="full" size="md" className="max-w-[160px]" />
        ) : (
          <h1
            className={cn(
              "font-display font-bold text-lg truncate tracking-tight",
              dark ? "text-white" : "text-gray-900"
            )}
            data-testid="header-title"
          >
            {title}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showBell && (
          <NotificationsBell
            className="border border-gray-200 bg-gray-50"
            iconClassName="w-4 h-4 text-gray-600"
          />
        )}
        {rightElement && (
          <div className="flex items-center justify-end" data-testid="header-right-element">
            {rightElement}
          </div>
        )}
      </div>
    </header>
  );
}
