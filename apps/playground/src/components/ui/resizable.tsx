import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

export function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof Group>): JSX.Element {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex size-full", className)}
      {...props}
    />
  );
}

export function ResizablePanel({ className, ...props }: ComponentProps<typeof Panel>): JSX.Element {
  return <Panel data-slot="resizable-panel" className={cn("size-full", className)} {...props} />;
}

export function ResizableHandle({
  className,
  ...props
}: ComponentProps<typeof Separator>): JSX.Element {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative z-10 flex w-px items-center justify-center bg-border outline-none after:absolute after:inset-y-0 after:-left-2 after:w-4 focus-visible:ring-1 focus-visible:ring-ring data-[separator=hover]:bg-primary/60 data-[separator=active]:bg-primary",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:-top-2 aria-[orientation=horizontal]:after:h-4 aria-[orientation=horizontal]:after:w-full",
        className,
      )}
      {...props}
    >
      <span className="flex h-9 w-3 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm group-aria-[orientation=horizontal]:h-3 group-aria-[orientation=horizontal]:w-9">
        <GripVertical className="size-3 group-aria-[orientation=horizontal]:rotate-90" />
      </span>
    </Separator>
  );
}
