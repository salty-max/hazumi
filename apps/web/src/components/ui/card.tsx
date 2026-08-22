import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center gap-2 border-b border-border px-4 py-2.5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div data-slot="card-title" className={cn("font-medium leading-none", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return <div data-slot="card-content" className={cn("p-4", className)} {...props} />;
}
