import type { CatalogGroup, CatalogModule, DocEntry, DocMember } from "@hazumi/docs/model";
import { ArrowLeft, ChevronRight, PanelLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { CodeBlock } from "../components/code-block";
import { InlineCode } from "../components/inline-code";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Kbd } from "../components/ui/kbd";
import { ScrollArea } from "../components/ui/scroll-area";
import { catalog } from "../lib/catalog";
import { InlineProse, Prose } from "../lib/prose";
import { cn } from "../lib/utils";

/**
 * A page per symbol, a page per module, and an index of the modules.
 *
 * Three hundred exports on one scroll was a document nobody reads. Even split
 * by module it left the big ones — assets at 65, draw at 48 — as a wall of
 * cards, and every interface still rendered as one block of highlighted code
 * with its prose buried inside as comments. Finding what `invMass` means cost
 * the same scan as reading the source, which is what a reference exists to
 * save you.
 *
 * So a symbol is a page: prose first, its members as rows with their own types
 * and their own sentences, the declaration underneath. Types that name
 * something else in the catalog are links, so a signature is a way through the
 * API rather than a dead end.
 */

function moduleSlug(name: string): string {
  return name.replace(/^hazumi\/?/, "") || "index";
}

function modulePath(name: string): string {
  return `/reference/${moduleSlug(name)}`;
}

function symbolPath(moduleName: string, symbol: string): string {
  return `${modulePath(moduleName)}/${symbol}`;
}

const ALL_MODULES: readonly CatalogModule[] = catalog.groups.flatMap((group) => group.modules);

/** Where every exported name lives, for turning a type reference into a link. */
const SYMBOL_PATHS: ReadonlyMap<string, string> = new Map(
  ALL_MODULES.flatMap((module) =>
    module.entries.map((entry) => [entry.name, symbolPath(module.name, entry.name)] as const),
  ),
);

interface Target {
  readonly module: CatalogModule;
  readonly entry: DocEntry | null;
}

/**
 * Resolve a URL tail into a module and, maybe, a symbol.
 *
 * Longest prefix wins, because a module slug can itself contain a slash:
 * `backends/webgl2/webgl2` is the `webgl2` export of `hazumi/backends/webgl2`,
 * and splitting on the first slash would go looking for a module called
 * `backends`.
 */
function resolveTarget(splat: string | undefined): Target | null {
  const path = (splat ?? "").replace(/^\/+|\/+$/g, "");
  if (path.length === 0) return null;
  const candidates = ALL_MODULES.filter(
    (module) => path === moduleSlug(module.name) || path.startsWith(`${moduleSlug(module.name)}/`),
  ).toSorted((a, b) => moduleSlug(b.name).length - moduleSlug(a.name).length);
  const module = candidates[0];
  if (module === undefined) return null;
  const rest = path.slice(moduleSlug(module.name).length).replace(/^\//, "");
  if (rest.length === 0) return { module, entry: null };
  const entry = module.entries.find((candidate) => candidate.name === rest);
  return entry === undefined ? null : { module, entry };
}

function groupOf(module: CatalogModule): CatalogGroup | undefined {
  return catalog.groups.find((group) => group.modules.includes(module));
}

/**
 * Which section an entry belongs in.
 *
 * By kind, and derived rather than curated: a topic map would read better on
 * the four big modules and would silently stop covering the API the first time
 * somebody adds an export without updating it. Errors get their own heading
 * because there are twenty-odd of them and none is what a reader wants while
 * they are still trying to do the thing.
 */
type SectionId = "functions" | "namespaces" | "constants" | "classes" | "errors" | "types";

const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
  functions: "Functions",
  namespaces: "Namespaces",
  constants: "Constants",
  classes: "Classes",
  errors: "Errors",
  types: "Types",
};

/** Reading order: what you call, then what you pass, then what goes wrong. */
const SECTION_ORDER: readonly SectionId[] = [
  "functions",
  "namespaces",
  "constants",
  "classes",
  "types",
  "errors",
];

function sectionOf(entry: DocEntry): SectionId {
  switch (entry.kind) {
    case "function":
      return "functions";
    case "namespace":
      return "namespaces";
    case "const":
      return "constants";
    case "class":
      return entry.name.endsWith("Error") ? "errors" : "classes";
    default:
      return "types";
  }
}

interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly entries: readonly DocEntry[];
}

function sectionsFor(entries: readonly DocEntry[]): readonly Section[] {
  const byId = new Map<SectionId, DocEntry[]>();
  for (const entry of entries) {
    const id = sectionOf(entry);
    const bucket = byId.get(id);
    if (bucket === undefined) byId.set(id, [entry]);
    else bucket.push(entry);
  }
  return SECTION_ORDER.filter((id) => byId.has(id)).map((id) => ({
    id,
    title: SECTION_TITLES[id],
    entries: (byId.get(id) ?? []).toSorted((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** First sentence, for a row that has to fit on one line. */
function summarize(text: string): string {
  const line = text.split("\n")[0] ?? "";
  const stop = line.search(/\.\s|\.$/);
  return stop < 0 ? line : line.slice(0, stop + 1);
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * A type, with every name the catalog knows turned into a link.
 *
 * This is what makes a signature navigable: `layer(name: Layer): TilemapLayer`
 * should take you to `TilemapLayer` rather than leaving you to search for it.
 * Names it does not know — `number`, a type parameter — render as plain code.
 */
function TypeText({ text }: { readonly text: string }): JSX.Element {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(IDENTIFIER)) {
    const path = SYMBOL_PATHS.get(match[0]);
    if (path === undefined) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={key} to={path} className="text-primary hover:underline">
        {match[0]}
      </Link>,
    );
    key += 1;
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <code className="font-mono text-xs break-words text-muted-foreground">{parts}</code>;
}

/**
 * Catalog names the declaration mentions, other than its own.
 *
 * A function page is otherwise a dead end: `material(effect: Material)` names a
 * type the reader almost certainly wants next, and the highlighted code block
 * cannot be clicked.
 */
function referencedTypes(entry: DocEntry): readonly string[] {
  const found = new Set<string>();
  for (const match of entry.signature.matchAll(IDENTIFIER)) {
    if (match[0] !== entry.name && SYMBOL_PATHS.has(match[0])) found.add(match[0]);
  }
  return [...found].toSorted((a, b) => a.localeCompare(b));
}

function MemberRow({ member }: { readonly member: DocMember }): JSX.Element {
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <span className="font-mono text-sm font-semibold break-words text-foreground">
          {member.name}
        </span>
        {member.optional && (
          <span className="ml-1.5 font-mono text-[0.62rem] text-muted-foreground">optional</span>
        )}
        {member.readonly && (
          <span className="ml-1.5 font-mono text-[0.62rem] text-muted-foreground">readonly</span>
        )}
      </div>
      <div className="min-w-0">
        <TypeText text={member.type} />
        <Prose text={member.description} />
      </div>
    </div>
  );
}

function SymbolView({
  module,
  entry,
}: {
  readonly module: CatalogModule;
  readonly entry: DocEntry;
}): JSX.Element {
  const related = useMemo(() => referencedTypes(entry), [entry]);
  return (
    <article>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 font-mono text-[0.7rem] text-muted-foreground">
        <Link to="/reference" className="hover:text-primary">
          Reference
        </Link>
        <ChevronRight className="size-3" />
        <Link to={modulePath(module.name)} className="hover:text-primary">
          {module.name}
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {entry.name}
          </h1>
          <Badge>{entry.kind}</Badge>
        </div>
      </header>

      {entry.deprecated.length > 0 && (
        <p className="mb-4 text-sm text-destructive">
          <strong>Deprecated.</strong> {entry.deprecated}
        </p>
      )}

      <div className="mb-8 max-w-[70ch]">
        <Prose text={entry.description} />
      </div>

      {entry.params.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-primary uppercase">
            Parameters
          </h2>
          {entry.params.map((param) => (
            <div key={param.name} className="mb-1.5 flex flex-wrap gap-x-3 text-sm">
              <InlineCode>{param.name}</InlineCode>
              <span className="text-muted-foreground">{param.description}</span>
            </div>
          ))}
        </section>
      )}

      {entry.returns.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-primary uppercase">
            Returns
          </h2>
          <p className="text-sm text-muted-foreground">{entry.returns}</p>
        </section>
      )}

      {entry.members.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-primary uppercase">
            {entry.kind === "const" ? "Values" : "Members"}
            <span className="ml-2 font-normal text-muted-foreground">{entry.members.length}</span>
          </h2>
          <div>
            {entry.members.map((member) => (
              <MemberRow key={member.name} member={member} />
            ))}
          </div>
        </section>
      )}

      {entry.examples.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-primary uppercase">
            Example
          </h2>
          {entry.examples.map((example, index) => (
            <CodeBlock key={index} source={example} example className="mb-3 last:mb-0" />
          ))}
        </section>
      )}

      {/* Last, not first: the declaration is the exact truth and worth showing,
          but it answers "what is the type" rather than "what is this for", and
          only one of those is why anybody came. */}
      <section>
        <h2 className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Declaration
        </h2>
        <CodeBlock source={entry.signature} />
        {related.length > 0 && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Uses
            </span>
            {related.map((name) => (
              <Link
                key={name}
                to={SYMBOL_PATHS.get(name) ?? "/reference"}
                className="font-mono text-xs text-primary hover:underline"
              >
                {name}
              </Link>
            ))}
          </p>
        )}
      </section>
    </article>
  );
}

function EntryRow({
  entry,
  moduleName,
}: {
  readonly entry: DocEntry;
  readonly moduleName: string;
}): JSX.Element {
  return (
    <Link
      to={symbolPath(moduleName, entry.name)}
      className="grid gap-x-6 gap-y-0.5 rounded-md border-b border-border/60 px-2 py-2.5 last:border-b-0 hover:bg-accent sm:grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)]"
    >
      <span className="font-mono text-sm font-semibold break-words text-foreground">
        {entry.name}
      </span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        <InlineProse text={summarize(entry.description)} />
      </span>
    </Link>
  );
}

function ModuleView({ module }: { readonly module: CatalogModule }): JSX.Element {
  const sections = useMemo(() => sectionsFor(module.entries), [module]);
  const group = groupOf(module);
  return (
    <>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 font-mono text-[0.7rem] text-muted-foreground">
        <Link to="/reference" className="hover:text-primary">
          Reference
        </Link>
        <ChevronRight className="size-3" />
        <span>{group?.title}</span>
      </nav>
      <header className="mb-8 border-b border-border pb-8">
        <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
          {module.name}
        </h1>
        <p className="mt-3 max-w-[60ch] text-muted-foreground">
          {module.blurb} {module.entries.length} exports.
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.id} className="mb-8">
          <h2 className="mb-2 font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {section.title}
            <span className="ml-2 font-normal text-muted-foreground">{section.entries.length}</span>
          </h2>
          <div>
            {section.entries.map((entry) => (
              <EntryRow key={entry.name} entry={entry} moduleName={module.name} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function OverviewView(): JSX.Element {
  return (
    <>
      <PageHeader title="Reference" className="mb-8 border-b border-border pb-8">
        {catalog.symbolCount} exports in {catalog.moduleCount} modules, read straight from the
        shipped <InlineCode>.d.ts</InlineCode>. Pick a module, or search across all of them.
      </PageHeader>
      {catalog.groups.map((group) => (
        <section key={group.id} className="mb-10">
          <h2 className="mb-1 font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {group.title}
          </h2>
          {group.lead.length > 0 && (
            <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">{group.lead}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {group.modules.map((module) => (
              <Link
                key={module.name}
                to={modulePath(module.name)}
                className="rounded-lg border border-border bg-card/40 p-4 transition-colors hover:border-primary/60 hover:bg-card"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {module.name}
                  </span>
                  <span className="font-mono text-[0.62rem] text-muted-foreground">
                    {module.entries.length}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{module.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

interface Hit {
  readonly entry: DocEntry;
  readonly module: CatalogModule;
  readonly rank: number;
}

/**
 * Rank a symbol against the query.
 *
 * Descriptions are searched as well as names, which is the half that was
 * missing: someone looking for "how do I make a sprite flash" has no name to
 * type, and the word they do have is in the prose.
 */
function scoreEntry(entry: DocEntry, needle: string): number {
  const name = entry.name.toLowerCase();
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if (entry.description.toLowerCase().includes(needle)) return 3;
  if (entry.signature.toLowerCase().includes(needle)) return 4;
  return -1;
}

function search(needle: string): readonly Hit[] {
  if (needle.length === 0) return [];
  const hits: Hit[] = [];
  for (const module of ALL_MODULES) {
    for (const entry of module.entries) {
      const rank = scoreEntry(entry, needle);
      if (rank >= 0) hits.push({ entry, module, rank });
    }
  }
  return hits.toSorted((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
}

function ResultsView({
  hits,
  query,
  onPick,
}: {
  readonly hits: readonly Hit[];
  readonly query: string;
  readonly onPick: () => void;
}): JSX.Element {
  if (hits.length === 0) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        Nothing matches “{query}”. Names, descriptions and signatures are all searched.
      </p>
    );
  }
  return (
    <div className="py-2">
      <p className="mb-4 text-sm text-muted-foreground">
        {hits.length} {hits.length === 1 ? "result" : "results"} for “{query}”
      </p>
      <ul className="m-0 list-none space-y-1 p-0">
        {hits.map((hit) => (
          <li key={`${hit.module.name}-${hit.entry.name}`}>
            <Link
              to={symbolPath(hit.module.name, hit.entry.name)}
              onClick={onPick}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md px-3 py-2 hover:bg-accent"
            >
              <span className="font-mono text-sm font-semibold text-foreground">
                {hit.entry.name}
              </span>
              <span className="font-mono text-[0.62rem] text-muted-foreground">
                {hit.module.name}
              </span>
              <Badge className="text-[0.6rem]">{hit.entry.kind}</Badge>
              <span className="w-full truncate text-xs text-muted-foreground">
                <InlineProse text={summarize(hit.entry.description)} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One module's row: a disclosure, not a link.
 *
 * Navigating from the heading was wrong on two counts. On a phone it closed the
 * drawer, so opening a module's contents and looking at them were the same
 * gesture and you never got to look. And on any width it made "show me what is
 * in here" cost a page load. The heading opens the list; the links inside it go
 * somewhere.
 */
function NavModule({
  module,
  active,
  currentSymbol,
  onNavigate,
}: {
  readonly module: CatalogModule;
  readonly active: boolean;
  readonly currentSymbol: string | null;
  readonly onNavigate: () => void;
}): JSX.Element {
  // Open where you already are, so arriving by deep link shows you the
  // neighbourhood you landed in.
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "flex w-full items-baseline gap-1.5 rounded-md px-2 py-1 text-left font-mono text-[0.7rem]",
          active
            ? "font-semibold text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-primary",
        )}
      >
        <ChevronRight
          className={cn("size-3 shrink-0 self-center transition-transform", open && "rotate-90")}
        />
        <span className="truncate">{module.name}</span>
        <span className="ml-auto text-[0.6rem] opacity-60">{module.entries.length}</span>
      </button>
      {open && (
        <ul className="m-0 mb-2 list-none border-l border-border p-0 pl-3">
          <li>
            <Link
              to={modulePath(module.name)}
              onClick={onNavigate}
              className={cn(
                "block truncate rounded-md px-2 py-0.5 text-[0.68rem]",
                active && currentSymbol === null
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-primary",
              )}
            >
              Overview
            </Link>
          </li>
          {sectionsFor(module.entries).map((section) =>
            section.entries.map((entry) => (
              <li key={entry.name}>
                <Link
                  to={symbolPath(module.name, entry.name)}
                  onClick={onNavigate}
                  className={cn(
                    "block truncate rounded-md px-2 py-0.5 font-mono text-[0.68rem]",
                    active && currentSymbol === entry.name
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-primary",
                  )}
                >
                  {entry.name}
                </Link>
              </li>
            )),
          )}
        </ul>
      )}
    </li>
  );
}

function ReferenceNav({
  current,
  currentSymbol,
  onNavigate,
}: {
  readonly current: CatalogModule | null;
  readonly currentSymbol: string | null;
  readonly onNavigate: () => void;
}): JSX.Element {
  return (
    <ScrollArea className="h-full">
      <nav aria-label="API modules" className="space-y-5 p-4 sm:p-5">
        <Link
          to="/reference"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
            current === null ? "text-primary" : "text-muted-foreground hover:text-primary",
          )}
        >
          <ArrowLeft className="size-3.5" />
          All modules
        </Link>
        {catalog.groups.map((group) => (
          <div key={group.id}>
            <p className="mb-1 px-1.5 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.title}
            </p>
            <ul className="m-0 list-none p-0">
              {group.modules.map((module) => (
                <NavModule
                  key={module.name}
                  module={module}
                  active={module === current}
                  currentSymbol={module === current ? currentSymbol : null}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

export function ReferencePage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const splat = params["*"];
  const target = resolveTarget(splat);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => search(needle), [needle]);

  // A path nobody publishes is a typo or a stale link, not an empty page.
  useEffect(() => {
    if (splat !== undefined && splat.length > 0 && target === null) {
      void navigate("/reference", { replace: true });
    }
  }, [splat, target, navigate]);

  // Each symbol is its own page now, so arriving at one should start at the top
  // of it rather than wherever the previous page happened to be scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setNavOpen(false);
        setQuery("");
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const editing = event.target;
      if (editing instanceof HTMLInputElement || editing instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      document.getElementById("reference-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return (): void => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mx-auto grid max-w-[1400px] lg:grid-cols-[270px_minmax(0,1fr)]">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close contents"
          onClick={() => setNavOpen(false)}
          className="fixed inset-x-0 top-16 bottom-0 z-20 cursor-default bg-background/70 backdrop-blur-sm lg:hidden"
        />
      ) : null}
      <aside
        id="reference-contents"
        // Off-canvas below `lg` so it costs no vertical space when shut; a
        // normal grid column from `lg` up, where there is room for both.
        className={cn(
          "z-30 w-[min(20rem,85vw)] border-border bg-background",
          "fixed top-16 bottom-0 left-0 border-r transition-transform duration-200 ease-out",
          navOpen ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:h-[calc(100dvh-4rem)] lg:w-auto lg:translate-x-0 lg:transition-none",
        )}
      >
        <ReferenceNav
          current={target?.module ?? null}
          currentSymbol={target?.entry?.name ?? null}
          onNavigate={() => setNavOpen(false)}
        />
      </aside>
      <main
        // `min-w-0` is load-bearing: below `lg` this is a single-column grid
        // whose track is `auto`, so a long type signature sizes the column to
        // its own width and the whole page scrolls sideways.
        className="min-w-0 px-5 pb-14 sm:px-10 lg:px-14"
      >
        {/* Sticky, and in the reading column rather than in a drawer: search is
            how most people arrive, and it was previously behind a button on
            every screen narrower than a laptop. */}
        <div className="sticky top-16 z-10 -mx-5 mb-8 border-b border-border bg-background/95 px-5 py-4 backdrop-blur sm:-mx-10 sm:px-10 lg:-mx-14 lg:px-14">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              aria-expanded={navOpen}
              aria-controls="reference-contents"
              onClick={() => setNavOpen(true)}
            >
              <PanelLeft />
              <span className="sr-only">Contents</span>
            </Button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
              <Input
                id="reference-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, descriptions and signatures…"
                aria-label="Search the reference"
                className="pr-12 pl-9"
              />
              <Kbd className="absolute top-2 right-3 hidden sm:inline-flex">/</Kbd>
            </div>
          </div>
        </div>

        {needle.length > 0 ? (
          <ResultsView hits={hits} query={query.trim()} onPick={() => setQuery("")} />
        ) : target === null ? (
          <OverviewView />
        ) : target.entry === null ? (
          <ModuleView module={target.module} />
        ) : (
          <SymbolView module={target.module} entry={target.entry} />
        )}
      </main>
    </div>
  );
}
