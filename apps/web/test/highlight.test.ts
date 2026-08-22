import { describe, expect, test } from "bun:test";
import { highlightCode } from "../src/lib/highlight";

describe("highlightCode", () => {
  test("highlights TypeScript tokens with stable classes", () => {
    const html = highlightCode('const scene: Scene = { draw() { return "ok"; } };');

    expect(html).toContain('<span class="tok-keyword">const</span>');
    expect(html).toContain('<span class="tok-typeName">Scene</span>');
    expect(html).toContain('<span class="tok-string">"ok"</span>');
  });

  test("escapes code before inserting it into the document", () => {
    const html = highlightCode('const value = "<script>&";');

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;&amp;");
  });
});
