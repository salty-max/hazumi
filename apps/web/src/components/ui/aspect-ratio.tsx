import type { ComponentProps, CSSProperties, JSX } from "react";
import { cn } from "../../lib/utils";

export function AspectRatio({
  ratio,
  className,
  style,
  ...props
}: ComponentProps<"div"> & { readonly ratio: number }): JSX.Element {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ ...style, "--ratio": ratio } as CSSProperties}
      className={cn("relative aspect-(--ratio) w-full", className)}
      {...props}
    />
  );
}
