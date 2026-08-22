import type { JSX } from "react";
import { cn } from "../lib/utils";

export function BrandMark({ className }: { readonly className?: string }): JSX.Element {
  return (
    <span className={cn("hazumi-mark", className)}>
      <span />
    </span>
  );
}
