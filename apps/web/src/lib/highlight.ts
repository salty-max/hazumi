import { classHighlighter, highlightTree } from "@lezer/highlight";
import { parser } from "@lezer/javascript";

const typescriptParser = parser.configure({ dialect: "ts" });

function escapeCode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render TypeScript as escaped HTML with stable `tok-*` syntax classes. */
export function highlightCode(source: string): string {
  const tree = typescriptParser.parse(source);
  let cursor = 0;
  let html = "";

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    html += escapeCode(source.slice(cursor, from));
    html += `<span class="${classes}">${escapeCode(source.slice(from, to))}</span>`;
    cursor = to;
  });

  return html + escapeCode(source.slice(cursor));
}
