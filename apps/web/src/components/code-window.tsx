import type { JSX } from "react";
import { CodeBlock } from "./code-block";
import { Card, CardHeader } from "./ui/card";

export function CodeWindow({
  filename,
  source,
}: {
  readonly filename: string;
  readonly source: string;
}): JSX.Element {
  return (
    <Card className="relative bg-editor shadow-2xl">
      <CardHeader className="h-11 gap-2 border-white/10 px-4">
        <span className="size-2.5 rounded-full bg-[#ff6b6b]" />
        <span className="size-2.5 rounded-full bg-[#ffd166]" />
        <span className="size-2.5 rounded-full bg-[#68d391]" />
        <span className="ml-auto font-mono text-[10px] text-white/40">{filename}</span>
      </CardHeader>
      <CodeBlock source={source} className="rounded-none p-5 leading-7" />
    </Card>
  );
}
