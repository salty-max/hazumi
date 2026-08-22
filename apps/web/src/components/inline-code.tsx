import type { ComponentProps, JSX } from "react";
import { cn } from "../lib/utils";

export function InlineCode({ className, ...props }: ComponentProps<"code">): JSX.Element {
  return (
    <code
      data-slot="inline-code"
      className={cn(
        "rounded-md bg-secondary px-[0.35em] py-[0.12em] font-mono text-[0.8em]",
        className,
      )}
      {...props}
    />
  );
}
