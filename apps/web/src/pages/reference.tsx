import type { CatalogGroup, CatalogModule, DocEntry } from "@hazumi/docs/model";
import { PanelLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";
import { CodeBlock } from "../components/code-block";
import { InlineCode } from "../components/inline-code";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Table, TableBody, TableCell, TableRow } from "../components/ui/table";
import { catalog } from "../lib/catalog";
import { Prose } from "../lib/prose";
import { cn } from "../lib/utils";

function moduleId(name: string): string {
  return name.replace(/[@/]/g, "");
}

function entryId(moduleName: string, entryName: string): string {
  return `${moduleId(moduleName)}-${entryName}`;
}

function matchesQuery(entry: DocEntry, query: string): boolean {
  if (query.length === 0) return true;
  return entry.name.toLowerCase().includes(query);
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
    <Card id={id} className="mt-3">
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

function ModuleSection({
  module,
  query,
}: {
  readonly module: CatalogModule;
  readonly query: string;
}): JSX.Element | null {
  const entries = module.entries.filter((entry) => matchesQuery(entry, query));
  if (entries.length === 0) return null;
  const id = moduleId(module.name);
  return (
    <section id={id} className="pt-10">
      <header className="mb-1 flex items-baseline gap-3">
        <h2 className="font-mono text-xl font-semibold tracking-tight">{module.name}</h2>
        <span className="font-mono text-[0.62rem] font-semibold text-muted-foreground">
          {entries.length}
        </span>
      </header>
      <p className="mb-4 text-sm text-muted-foreground">{module.blurb}</p>
      {entries.map((entry) => (
        <EntryCard key={entry.name} entry={entry} moduleName={module.name} />
      ))}
    </section>
  );
}

function GroupSection({
  group,
  query,
}: {
  readonly group: CatalogGroup;
  readonly query: string;
}): JSX.Element | null {
  const visible = group.modules.filter((module) =>
    module.entries.some((entry) => matchesQuery(entry, query)),
  );
  if (visible.length === 0) return null;
  return (
    <section id={`group-${group.id}`} className="mt-12">
      <h2 className="mb-2 font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        {group.title}
      </h2>
      {visible.map((module) => (
        <ModuleSection key={module.name} module={module} query={query} />
      ))}
    </section>
  );
}

function ReferenceNav({
  groups,
  query,
  onQueryChange,
  onNavigate,
}: {
  readonly groups: readonly CatalogGroup[];
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onNavigate: () => void;
}): JSX.Element {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-5">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
          <Input
            id="reference-filter"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search symbols…"
            aria-label="Filter reference"
            className="pl-9"
          />
        </div>
        <nav aria-label="API modules" className="space-y-4">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="mb-1 px-1.5 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {group.title}
              </p>
              {group.modules.map((module) => (
                <div key={module.name} className="mb-3">
                  <a
                    href={`#${moduleId(module.name)}`}
                    onClick={onNavigate}
                    className="block px-1.5 py-1 font-mono text-[0.68rem] font-semibold"
                  >
                    {module.name}
                  </a>
                  <ul className="m-0 list-none p-0">
                    {module.entries.map((entry) => (
                      <li key={entry.name}>
                        <a
                          href={`#${entryId(module.name, entry.name)}`}
                          onClick={onNavigate}
                          className="block truncate rounded-md px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground hover:bg-accent hover:text-primary"
                        >
                          {entry.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </ScrollArea>
  );
}

export function ReferencePage(): JSX.Element {
  const [query, setQuery] = useState("");
  // Collapsed by default below `lg`, where the grid is one column: pinned open,
  // the whole contents list sits between the reader and the reference itself.
  const [navOpen, setNavOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      catalog.groups
        .map((group) => ({
          ...group,
          modules: group.modules
            .map((module) => ({
              ...module,
              entries: module.entries.filter((entry) => matchesQuery(entry, needle)),
            }))
            .filter((module) => module.entries.length > 0),
        }))
        .filter((group) => group.modules.length > 0),
    [needle],
  );

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id.length === 0) return;
    document.getElementById(id)?.scrollIntoView();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && navOpen) {
        setNavOpen(false);
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      // Searching is the point of opening it, so surface the field first.
      setNavOpen(true);
      requestAnimationFrame(() => document.getElementById("reference-filter")?.focus());
    };
    window.addEventListener("keydown", onKey);
    return (): void => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

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
          groups={filtered}
          query={query}
          onQueryChange={setQuery}
          onNavigate={() => setNavOpen(false)}
        />
      </aside>
      <main
        // `min-w-0` is load-bearing: below `lg` this is a single-column grid
        // whose track is `auto`, so a long type signature sizes the column to
        // its own width and the whole page scrolls sideways.
        className="min-w-0 px-5 py-10 sm:px-10 lg:px-14 lg:py-14"
      >
        <Button
          variant="outline"
          size="sm"
          className="mb-6 lg:hidden"
          aria-expanded={navOpen}
          aria-controls="reference-contents"
          onClick={() => setNavOpen(true)}
        >
          <PanelLeft />
          Contents
        </Button>
        <PageHeader title="Reference" className="mb-8 border-b border-border pb-8">
          {catalog.symbolCount} exports in {catalog.moduleCount} modules, from the shipped{" "}
          <InlineCode>.d.ts</InlineCode>. Scene, then math, then backends.
        </PageHeader>
        {filtered.map((group) => (
          <GroupSection key={group.id} group={group} query={needle} />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No symbols match “{query}”.</p>
        )}
      </main>
    </div>
  );
}
