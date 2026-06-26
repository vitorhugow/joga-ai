import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const jogaButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-sans font-bold tracking-tight cursor-pointer transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
  {
    variants: {
      variant: {
        primary: "joga-btn-primary text-white",
        gold: "joga-btn-gold text-amber-950",
        ghost: "joga-btn-ghost text-white/80",
        danger: "joga-btn-danger text-red-100",
        outline: "joga-btn-outline text-foreground",
        arena: "joga-btn-arena text-emerald-100",
      },
      size: {
        sm: "min-h-10 px-4 py-2 text-sm rounded-xl",
        md: "min-h-12 px-5 py-2.5 text-base rounded-2xl",
        lg: "min-h-14 px-6 py-3.5 text-lg rounded-2xl w-full",
        icon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface JogaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof jogaButtonVariants> {}

export const JogaButton = React.forwardRef<HTMLButtonElement, JogaButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(jogaButtonVariants({ variant, size }), className)} {...props}>
        {children}
      </button>
    );
  }
);

JogaButton.displayName = "JogaButton";
