import type { DocEntry } from "./extract";

export type { DocEntry, DocKind, DocModule, DocParam } from "./extract";

export type RefGroup = "scene" | "library" | "backends";

export interface CatalogModule {
  readonly name: string;
  readonly blurb: string;
  readonly entries: readonly DocEntry[];
}

export interface CatalogGroup {
  readonly id: RefGroup;
  readonly title: string;
  readonly lead: string;
  readonly modules: readonly CatalogModule[];
}

export interface Catalog {
  readonly groups: readonly CatalogGroup[];
  readonly symbolCount: number;
  readonly moduleCount: number;
}
