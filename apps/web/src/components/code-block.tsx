import type { JSX } from "react";
import { highlightCode } from "../lib/highlight";
import { cn } from "../lib/utils";

export function CodeBlock({
  source,
  className,
  example = false,
}: {
  readonly source: string;
  readonly className?: string;
  readonly example?: boolean;
}): JSX.Element {
  return (
    <pre
      data-slot="code-block"
      className={cn(
        "overflow-x-auto rounded-lg bg-editor p-3.5 font-mono text-xs leading-6",
        example ? "border-l-3 border-primary" : null,
        className,
      )}
    >
      <code dangerouslySetInnerHTML={{ __html: highlightCode(source) }} />
    </pre>
  );
}
