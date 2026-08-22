import type { ComponentProps, JSX } from "react";
import { cn } from "../lib/utils";

export function Container({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8", className)}
      {...props}
    />
  );
}
