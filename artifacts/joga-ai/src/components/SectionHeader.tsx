import { Link } from "wouter";
import { ChevronRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  actionUrl?: string;
  className?: string;
}

export function SectionHeader({ title, actionLabel, actionUrl, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`} data-testid="section-header">
      <h2 className="font-display font-semibold text-white text-lg uppercase tracking-wide">{title}</h2>
      {actionLabel && actionUrl && (
        <Link
          href={actionUrl}
          className="flex items-center text-primary text-sm font-medium hover:text-primary/80 transition-colors"
          data-testid="section-header-action"
        >
          {actionLabel}
          <ChevronRight className="w-4 h-4 ml-0.5" />
        </Link>
      )}
    </div>
  );
}
