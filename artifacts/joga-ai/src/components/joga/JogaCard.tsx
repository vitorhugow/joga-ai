import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const jogaCardVariants = cva("rounded-2xl border", {
  variants: {
    variant: {
      light: "joga-card-light",
      dark: "joga-card-dark",
      glass: "joga-card-glass",
      arena: "joga-card-arena",
    },
    padding: {
      none: "p-0",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: {
    variant: "light",
    padding: "md",
  },
});

export interface JogaCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof jogaCardVariants> {}

export function JogaCard({ className, variant, padding, children, ...props }: JogaCardProps) {
  return (
    <div className={cn(jogaCardVariants({ variant, padding }), className)} {...props}>
      {children}
    </div>
  );
}
