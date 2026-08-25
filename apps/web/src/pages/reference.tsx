import type { CatalogGroup, CatalogModule, DocEntry } from "@hazumi/docs/model";
import { ArrowLeft, PanelLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { CodeBlock } from "../components/code-block";
import { InlineCode } from "../components/inline-code";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Kbd } from "../components/ui/kbd";
import { ScrollArea } from "../components/ui/scroll-area";
import { Table, TableBody, TableCell, TableRow } from "../components/ui/table";
import { catalog } from "../lib/catalog";
import { Prose } from "../lib/prose";
import { cn } from "../lib/utils";

/**
 * The reference is one module at a time, not one page of everything.
 *
 * Three hundred exports rendered as three hundred cards is a document nobody
 * reads: the only way in is the browser's own find, and that only works if you
 * already know the name. So a module is the unit — you arrive at an index of
 * fourteen of them, pick one, and read a page you can actually finish.
 *
 * Search cuts across all of it, because the other way people arrive is knowing
 * a word and not where it lives.
 */

function moduleSlug(name: string): string {
  return name.replace(/^hazumi\/?/, "") || "index";
}

function moduleId(name: string): string {
  return name.replace(/[@/]/g, "");
}

function entryId(moduleName: string, entryName: string): string {
  return `${moduleId(moduleName)}-${entryName}`;
}

function modulePath(name: string): string {
  return `/reference/${moduleSlug(name)}`;
}

const ALL_MODULES: readonly CatalogModule[] = catalog.groups.flatMap((group) => group.modules);

function findModule(slug: string | undefined): CatalogModule | null {
  if (slug === undefined || slug.length === 0) return null;
  return ALL_MODULES.find((module) => moduleSlug(module.name) === slug) ?? null;
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
 * because there are twenty-odd of them and none is what a reader is looking
 * for while they are still trying to do the thing.
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

/** First sentence, for a search result that must fit on one line. */
function summarize(text: string): string {
  const line = text.split("\n")[0] ?? "";
  const stop = line.search(/\.\s|\.$/);
  return stop < 0 ? line : line.slice(0, stop + 1);
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

function EntryCard({
  entry,
  moduleName,
}: {
  readonly entry: DocEntry;
  readonly moduleName: string;
}): JSX.Element {
  const id = entryId(moduleName, entry.name);
  return (
    <Card id={id} className="mt-3 scroll-mt-24">
      <CardHeader className="flex-wrap gap-2 px-4 py-3 sm:px-5">
        <CardTitle className="font-mono text-sm font-semibold">
          <a href={`#${id}`} className="text-foreground hover:text-primary">
            {entry.name}
          </a>
        </CardTitle>
        <Badge>{entry.kind}</Badge>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-4 sm:px-5 sm:pb-5">
        <CodeBlock source={entry.signature} className="mb-4" />
        {entry.deprecated.length > 0 && (
          <p className="mb-3 text-sm text-destructive">
            <strong>Deprecated.</strong> {entry.deprecated}
          </p>
        )}
        <Prose text={entry.description} />
        {entry.params.length > 0 && (
          <Table className="mb-4">
            <TableBody>
              {entry.params.map((param) => (
                <TableRow key={param.name}>
                  <TableCell className="w-0 whitespace-nowrap text-foreground">
                    <InlineCode>{param.name}</InlineCode>
                  </TableCell>
                  <TableCell>{param.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {entry.returns.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="mr-2 font-mono text-[0.58rem] font-semibold tracking-[0.1em] uppercase">
              Returns
            </span>
            {entry.returns}
          </p>
        )}
        {entry.examples.map((example, index) => (
          <CodeBlock key={index} source={example} example className="mb-3 last:mb-0" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Every name in the module, as one scannable block above the detail. */
function ModuleIndex({
  sections,
  moduleName,
}: {
  readonly sections: readonly Section[];
  readonly moduleName: string;
}): JSX.Element {
  return (
    <div className="mb-10 rounded-lg border border-border bg-card/40 p-4 sm:p-5">
      {sections.map((section) => (
        <div key={section.id} className="mb-4 last:mb-0">
          <p className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {section.title}
            <span className="ml-2 font-normal">{section.entries.length}</span>
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
            {section.entries.map((entry) => (
              <li key={entry.name}>
                <a
                  href={`#${entryId(moduleName, entry.name)}`}
                  className="font-mono text-xs text-muted-foreground hover:text-primary"
                >
                  {entry.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ModuleView({ module }: { readonly module: CatalogModule }): JSX.Element {
  const sections = useMemo(() => sectionsFor(module.entries), [module]);
  const group = groupOf(module);
  return (
    <>
      <header className="mb-6 border-b border-border pb-8">
        {group !== undefined && (
          <p className="mb-2 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-primary uppercase">
            {group.title}
          </p>
        )}
        <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
          {module.name}
        </h1>
        <p className="mt-3 max-w-[60ch] text-muted-foreground">
          {module.blurb} {module.entries.length} exports.
        </p>
      </header>
      <ModuleIndex sections={sections} moduleName={module.name} />
      {sections.map((section) => (
        <section key={section.id} id={`${moduleId(module.name)}-section-${section.id}`}>
          <h2 className="mt-10 mb-1 font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {section.title}
          </h2>
          {section.entries.map((entry) => (
            <EntryCard key={entry.name} entry={entry} moduleName={module.name} />
          ))}
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
              to={`${modulePath(hit.module.name)}#${entryId(hit.module.name, hit.entry.name)}`}
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
                {summarize(hit.entry.description)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceNav({
  current,
  onNavigate,
}: {
  readonly current: CatalogModule | null;
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
              {group.modules.map((module) => {
                const active = module === current;
                return (
                  <li key={module.name}>
                    <Link
                      to={modulePath(module.name)}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-baseline justify-between gap-2 rounded-md px-2 py-1 font-mono text-[0.7rem]",
                        active
                          ? "bg-accent font-semibold text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-primary",
                      )}
                    >
                      <span className="truncate">{module.name}</span>
                      <span className="text-[0.6rem] opacity-60">{module.entries.length}</span>
                    </Link>
                    {/* Only the open module lists its symbols: every module at
                        once is the wall of names this page used to be. */}
                    {active && (
                      <ul className="m-0 mb-2 list-none border-l border-border p-0 pl-3">
                        {sectionsFor(module.entries).map((section) =>
                          section.entries.map((entry) => (
                            <li key={entry.name}>
                              <a
                                href={`#${entryId(module.name, entry.name)}`}
                                onClick={onNavigate}
                                className="block truncate rounded-md px-2 py-0.5 font-mono text-[0.68rem] text-muted-foreground hover:bg-accent hover:text-primary"
                              >
                                {entry.name}
                              </a>
                            </li>
                          )),
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
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
  const slug = params["*"];
  const current = findModule(slug);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => search(needle), [needle]);

  // A slug nobody publishes is a typo or a stale link, not an empty page.
  useEffect(() => {
    if (slug !== undefined && slug.length > 0 && current === null) {
      void navigate("/reference", { replace: true });
    }
  }, [slug, current, navigate]);

  // Hash targets only exist once the module has rendered, so this waits a
  // frame rather than running on mount alone.
  //
  // Keyed on the hash as well as the module: a search result for a symbol in
  // the module already open changes the hash and nothing else, and depending
  // on the module alone left that click doing visibly nothing.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id.length === 0) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
    return (): void => cancelAnimationFrame(frame);
  }, [current, location.hash, location.key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setNavOpen(false);
        setQuery("");
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
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
        <ReferenceNav current={current} onNavigate={() => setNavOpen(false)} />
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
        ) : current === null ? (
          <OverviewView />
        ) : (
          <ModuleView module={current} />
        )}
      </main>
    </div>
  );
}
