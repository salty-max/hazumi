import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">): JSX.Element {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">): JSX.Element {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">): JSX.Element {
  return <tr data-slot="table-row" className={className} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<"td">): JSX.Element {
  return (
    <td
      data-slot="table-cell"
      className={cn("py-1 pr-4 align-top text-muted-foreground", className)}
      {...props}
    />
  );
}
