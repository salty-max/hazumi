import type { JSX } from "react";
import { Link, type LinkProps } from "react-router";
import { buttonVariants } from "./ui/button";
import { cn } from "../lib/utils";

export function ButtonLink({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<LinkProps, "className"> & {
  readonly className?: string;
  readonly variant?: "default" | "outline" | "ghost" | "destructive" | "link";
  readonly size?: "default" | "sm" | "lg" | "icon";
}): JSX.Element {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
