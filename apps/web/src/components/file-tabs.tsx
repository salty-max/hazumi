import type { JSX } from "react";
import { cn } from "../lib/utils";

export function FileTabs({
  files,
  activeIndex,
  onSelect,
}: {
  readonly files: ReadonlyArray<{ readonly name: string }>;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
}): JSX.Element {
  return (
    <div className="ml-2 flex h-full items-end gap-0.5">
      {files.map((file, index) => (
        <button
          type="button"
          key={file.name}
          onClick={() => onSelect(index)}
          className={cn(
            "h-7 border-b-2 px-2 font-mono text-[11px]",
            index === activeIndex
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {file.name}
        </button>
      ))}
    </div>
  );
}
