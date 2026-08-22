import type { JSX, ReactNode } from "react";

export function PanelHeader({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-panel px-3">
      <span className="text-xs font-medium text-foreground">{title}</span>
      {children}
    </div>
  );
}
