import { cn } from "@/lib/utils";
import { BRAND_ASSETS, type BrandAssetKey } from "./brandAssets";

const SIZE_CLASS = {
  xs: "h-6 w-auto",
  sm: "h-8 w-auto",
  md: "h-10 w-auto",
  lg: "h-12 w-auto",
  xl: "h-14 w-auto",
} as const;

type JogaLogoProps = {
  variant?: BrandAssetKey;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  alt?: string;
};

export function JogaLogo({
  variant = "full",
  size = "sm",
  className,
  alt = "JOGA AI",
}: JogaLogoProps) {
  return (
    <img
      src={BRAND_ASSETS[variant]}
      alt={alt}
      className={cn(
        "bg-transparent object-contain select-none shrink-0 shadow-none",
        SIZE_CLASS[size],
        className,
      )}
      draggable={false}
    />
  );
}
