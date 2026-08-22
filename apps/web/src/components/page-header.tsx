import type { JSX, ReactNode } from "react";
import { cn } from "../lib/utils";

export function PageHeader({
  title,
  children,
  className,
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <header className={cn("mb-10", className)}>
      <h1 className="font-display text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.94] font-semibold tracking-[-0.045em]">
        {title}
      </h1>
      {children === undefined ? null : (
        <div className="mt-3 max-w-[60ch] text-muted-foreground">{children}</div>
      )}
    </header>
  );
}
