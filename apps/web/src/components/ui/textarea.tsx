import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">): JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full resize-none rounded-lg border border-input bg-background p-3 font-mono text-xs leading-5 text-muted-foreground outline-none selection:bg-primary/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
