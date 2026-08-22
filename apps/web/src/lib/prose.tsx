import type { JSX, ReactNode } from "react";
import { InlineCode } from "../components/inline-code";

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index;
    if (index > last) parts.push(text.slice(last, index));
    if (token.startsWith("`")) {
      parts.push(<InlineCode key={key}>{token.slice(1, -1)}</InlineCode>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    key += 1;
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Prose({ text }: { readonly text: string }): JSX.Element | null {
  if (text.length === 0) return null;
  return (
    <div className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="mb-3 last:mb-0">
          {renderInline(paragraph.replace(/\n/g, " "))}
        </p>
      ))}
    </div>
  );
}
