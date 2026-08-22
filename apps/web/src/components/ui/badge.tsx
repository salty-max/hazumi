import { cva } from "class-variance-authority";
import type { ClassValue } from "clsx";
import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const badgeVariants: (props?: {
  variant?: BadgeVariant | null;
  className?: ClassValue;
}) => string = cva(
  "inline-flex w-fit shrink-0 items-center rounded-full border border-transparent px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = ComponentProps<"span"> & {
  readonly variant?: BadgeVariant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps): JSX.Element {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
