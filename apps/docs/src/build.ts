/**
 * Generates the API reference from the emitted declaration files.
 *
 * Run with: bun run apps/docs/src/build.ts
 */
import { mkdir } from 'node:fs/promises';

import { extractModule, type DocEntry, type DocModule } from './extract';
import { highlightCode } from './highlight';

const ROOT = new URL('../../../', import.meta.url).pathname;
const FONT_FILES = [
  'bricolage-grotesque-vietnamese-wght-normal.woff2',
  'bricolage-grotesque-latin-ext-wght-normal.woff2',
  'bricolage-grotesque-latin-wght-normal.woff2',
] as const;

/** Order matters: the reference reads top-down as the layer stack. */
const PACKAGES: ReadonlyArray<[string, string, string]> = [
  ['matter', 'packages/matter/dist/index.d.ts', 'The batteries-included entry point.'],
  ['@matter/core', 'packages/core/dist/index.d.ts', 'L0 — lifecycle, clock, plugins.'],
  ['@matter/math', 'packages/math/dist/index.d.ts', 'L1 — vectors, matrices, randomness, noise.'],
  ['@matter/color', 'packages/color/dist/index.d.ts', 'L2 — OKLCH colour.'],
  ['@matter/graphics', 'packages/graphics/dist/index.d.ts', 'L3 — the command buffer.'],
  ['@matter/backend-webgl2', 'packages/backend-webgl2/dist/index.d.ts', 'L4 — the primary renderer.'],
  ['@matter/backend-canvas2d', 'packages/backend-canvas2d/dist/index.d.ts', 'L4 — reference renderer.'],
  ['@matter/backend-svg', 'packages/backend-svg/dist/index.d.ts', 'L4 — vector export.'],
  ['@matter/backend-headless', 'packages/backend-headless/dist/index.d.ts', 'L4 — command recorder.'],
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Just enough markdown for doc prose: inline code, emphasis, paragraphs. */
function renderProse(text: string): string {
  if (text.length === 0) return '';
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = escapeHtml(paragraph)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold before italic, or the double asterisks match as two italics.
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, ' ');
      return `<p>${html}</p>`;
    })
    .join('');
}

function renderEntry(entry: DocEntry, moduleId: string): string {
  const id = `${moduleId}-${entry.name}`;
  const parts: string[] = [
    `<article class="entry" id="${id}">`,
    `<h3><a href="#${id}">${escapeHtml(entry.name)}</a><span class="kind">${entry.kind}</span></h3>`,
    `<pre class="sig"><code>${highlightCode(entry.signature)}</code></pre>`,
  ];

  if (entry.deprecated.length > 0) {
    parts.push(`<p class="deprecated"><strong>Deprecated.</strong> ${escapeHtml(entry.deprecated)}</p>`);
  }
  if (entry.description.length > 0) {
    parts.push(`<div class="prose">${renderProse(entry.description)}</div>`);
  }
  if (entry.params.length > 0) {
    const rows = entry.params
      .map((p) => `<tr><td><code>${escapeHtml(p.name)}</code></td><td>${escapeHtml(p.description)}</td></tr>`)
      .join('');
    parts.push(`<table class="params"><tbody>${rows}</tbody></table>`);
  }
  if (entry.returns.length > 0) {
    parts.push(`<p class="returns"><span>Returns</span> ${escapeHtml(entry.returns)}</p>`);
  }
  for (const example of entry.examples) {
    parts.push(`<pre class="example"><code>${highlightCode(example)}</code></pre>`);
  }

  parts.push('</article>');
  return parts.join('');
}

function renderModule(mod: DocModule, blurb: string): string {
  const id = mod.name.replace(/[@/]/g, '');
  return [
    `<section class="module" id="${id}">`,
    `<h2>${escapeHtml(mod.name)}</h2>`,
    `<p class="blurb">${escapeHtml(blurb)}</p>`,
    mod.entries.map((e) => renderEntry(e, id)).join(''),
    '</section>',
  ].join('');
}

function renderNav(modules: ReadonlyArray<[DocModule, string]>): string {
  return modules
    .map(([mod]) => {
      const id = mod.name.replace(/[@/]/g, '');
      const links = mod.entries
        .map((e) => `<li><a href="#${id}-${e.name}">${escapeHtml(e.name)}</a></li>`)
        .join('');
      return `<div class="nav-group"><a class="nav-module" href="#${id}">${escapeHtml(mod.name)}</a><ul>${links}</ul></div>`;
    })
    .join('');
}

// Read every declaration file at once, then assemble in declared order — the
// reference reads top-down as the layer stack, so order is part of the output.
const sources = await Promise.all(
  PACKAGES.map(async ([name, relative, blurb]) => {
    const file = Bun.file(ROOT + relative);
    const exists = await file.exists();
    return { name, relative, blurb, text: exists ? await file.text() : null };
  }),
);

const modules: Array<[DocModule, string]> = [];
let total = 0;

for (const { name, relative, blurb, text } of sources) {
  if (text === null) {
    console.warn(`skipping ${name}: ${relative} not built`);
    continue;
  }
  const mod = extractModule(name, text);
  total += mod.entries.length;
  modules.push([mod, blurb]);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Matter reference</title>
<link rel="stylesheet" href="/apps/docs/dist/style.css" />
</head>
<body class="docs-shell">
<aside class="docs-sidebar">
  <a class="docs-brand" href="/"><span class="brand-mark"></span><span>Matter</span><small>Reference</small></a>
  <div class="docs-search-wrap"><input id="filter" type="search" placeholder="Search symbols…" aria-label="Filter reference" /></div>
  <nav id="nav" aria-label="API modules">${renderNav(modules)}</nav>
</aside>
<main class="docs-main">
  <header class="page-head">
    <p class="kicker">Typed from source</p>
    <h1>API reference</h1>
    <p>${total} exported symbols across ${modules.length} modules, generated directly from the published type declarations.</p>
  </header>
  ${modules.map(([mod, blurb]) => renderModule(mod, blurb)).join('')}
</main>
<script src="/apps/docs/dist/filter.js"></script>
</body>
</html>
`;

await Bun.write(`${ROOT}apps/docs/dist/index.html`, html);
await Bun.write(
  `${ROOT}apps/docs/dist/reference.json`,
  JSON.stringify(modules.map(([mod]) => mod), null, 2),
);
await Bun.write(`${ROOT}apps/docs/dist/filter.js`, Bun.file(`${ROOT}apps/docs/src/filter.js`));

const fontSource = new URL(
  './files/',
  import.meta.resolve('@fontsource-variable/bricolage-grotesque'),
);
const fontOutput = `${ROOT}apps/docs/dist/files/`;
await mkdir(fontOutput, { recursive: true });
await Promise.all(
  FONT_FILES.map((file) => Bun.write(`${fontOutput}${file}`, Bun.file(new URL(file, fontSource)))),
);

console.log(`reference: ${modules.length} modules, ${total} symbols`);
