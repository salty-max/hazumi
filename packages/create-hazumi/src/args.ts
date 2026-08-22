import { UserError } from "./errors";

export const TemplateKind = {
  Sketch: "sketch",
  Game: "game",
} as const;

export type TemplateKind = (typeof TemplateKind)[keyof typeof TemplateKind];

export const TEMPLATE_KINDS: readonly TemplateKind[] = [TemplateKind.Sketch, TemplateKind.Game];

export interface CliArgs {
  readonly help: boolean;
  readonly yes: boolean;
  readonly local: boolean;
  readonly autoImport: boolean;
  /** `undefined` means the wizard should ask. */
  readonly install: boolean | undefined;
  readonly template: TemplateKind | undefined;
  readonly directory: string | undefined;
}

export const HELP = `create-hazumi — scaffold a Vite + Hazumi project

Usage:
  create-hazumi [directory]

The wizard asks for a name and whether you want a sketch (draw) or a game
(update + draw). \`vite build\` writes a static dist/ you can zip for itch.io
or GitHub Pages.

Options:
  -t, --template <sketch|game>  Skip the kind question
  -y, --yes                     Skip the wizard; use defaults
      --local                   Depend on this repo's packages via file:
      --auto-import             Use *.scene.ts + the Vite auto-import plugin
      --no-install              Do not install dependencies
  -h, --help                    Show this help

Examples:
  bun create hazumi
  bun create hazumi my-game --template game
  bun packages/create-hazumi/src/index.ts demo --local --yes
`;

function isTemplateKind(value: string): value is TemplateKind {
  return value === TemplateKind.Sketch || value === TemplateKind.Game;
}

function takeValue(
  flag: string,
  argv: readonly string[],
  index: number,
): { value: string; next: number } {
  const inline = flag.startsWith("--") ? flag.indexOf("=") : -1;
  if (inline !== -1) {
    const value = flag.slice(inline + 1);
    if (value.length === 0) {
      throw new UserError(`Flag ${flag.slice(0, inline)} is missing a value.`);
    }
    return { value, next: index + 1 };
  }

  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new UserError(`Flag ${flag} is missing a value.`);
  }
  return { value, next: index + 2 };
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let help = false;
  let yes = false;
  let local = false;
  let autoImport = false;
  let install: boolean | undefined;
  let template: TemplateKind | undefined;
  let directory: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "--") {
      throw new UserError("Unexpected --; create-hazumi takes at most one directory.");
    }

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "-y" || arg === "--yes") {
      yes = true;
      continue;
    }
    if (arg === "--local") {
      local = true;
      continue;
    }
    if (arg === "--auto-import") {
      autoImport = true;
      continue;
    }
    if (arg === "--no-install") {
      install = false;
      continue;
    }

    const templateFlag = arg === "-t" || arg === "--template" || arg.startsWith("--template=");
    if (templateFlag) {
      const taken = takeValue(arg, argv, i);
      if (!isTemplateKind(taken.value)) {
        throw new UserError(
          `Unknown template "${taken.value}". Use ${TEMPLATE_KINDS.join(" or ")}.`,
        );
      }
      template = taken.value;
      i = taken.next - 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new UserError(`Unknown flag ${arg}. Pass --help to see options.`);
    }

    if (directory !== undefined) {
      throw new UserError("create-hazumi takes at most one directory.");
    }
    directory = arg;
  }

  return { help, yes, local, autoImport, install, template, directory };
}

export function parseTemplateChoice(raw: string): TemplateKind | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === TemplateKind.Sketch) return TemplateKind.Sketch;
  if (value === "2" || value === TemplateKind.Game) return TemplateKind.Game;
  return undefined;
}

export function parseYesNo(raw: string, fallback: boolean): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return fallback;
  if (value === "y" || value === "yes") return true;
  if (value === "n" || value === "no") return false;
  return undefined;
}
