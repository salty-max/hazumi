import { parseTemplateChoice, parseYesNo, TemplateKind, type CliArgs } from "./args";
import type { PackageManagerName } from "./files";
import { UserError } from "./errors";
import { resolveTarget, toPackageName, type Target } from "./names";

export interface WizardIo {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
}

export interface WizardAnswers {
  readonly target: Target;
  readonly template: TemplateKind;
  readonly autoImport: boolean;
  readonly local: boolean;
  readonly install: boolean;
}

const DEFAULT_NAME = "hazumi-scene";
const DEFAULT_TEMPLATE: TemplateKind = TemplateKind.Sketch;

export async function resolveAnswers(
  args: CliArgs,
  cwd: string,
  io: WizardIo,
  packageManager: PackageManagerName,
): Promise<WizardAnswers> {
  if (args.yes) {
    const directoryArg = args.directory ?? DEFAULT_NAME;
    return {
      target: resolveTarget(cwd, directoryArg),
      template: args.template ?? DEFAULT_TEMPLATE,
      autoImport: args.autoImport,
      local: args.local,
      install: args.install ?? true,
    };
  }
  return promptAnswers(args, cwd, io, packageManager);
}

async function promptAnswers(
  args: CliArgs,
  cwd: string,
  io: WizardIo,
  packageManager: PackageManagerName,
): Promise<WizardAnswers> {
  const reader = new LineReader(io.stdin);

  writeln(io.stdout, "");
  writeln(io.stdout, "create-hazumi");
  writeln(io.stdout, "A Vite project that draws with Hazumi.");
  writeln(io.stdout, "");

  const directoryArg = args.directory ?? (await askName(reader, io.stdout));
  const target = resolveTarget(cwd, directoryArg);
  const template = args.template ?? (await askTemplate(reader, io.stdout));
  const install = args.install ?? (await askInstall(reader, io.stdout, packageManager));

  return {
    target,
    template,
    autoImport: args.autoImport,
    local: args.local,
    install,
  };
}

async function askName(reader: LineReader, stdout: NodeJS.WritableStream): Promise<string> {
  const raw = await question(reader, stdout, `Project name (${DEFAULT_NAME}): `);
  const value = raw.trim() === "" ? DEFAULT_NAME : raw.trim();
  if (value === "." || value === "./") return value;
  try {
    toPackageName(value);
    return value;
  } catch (error) {
    if (error instanceof UserError) {
      writeln(stdout, error.message);
      return askName(reader, stdout);
    }
    throw error;
  }
}

async function askTemplate(
  reader: LineReader,
  stdout: NodeJS.WritableStream,
): Promise<TemplateKind> {
  writeln(stdout, "What are you making?");
  writeln(stdout, "  1) Sketch  —  draw() only, generative / interactive");
  writeln(stdout, "  2) Game    —  update(dt) + draw(alpha), fixed-step");
  return askTemplateChoice(reader, stdout);
}

async function askTemplateChoice(
  reader: LineReader,
  stdout: NodeJS.WritableStream,
): Promise<TemplateKind> {
  const raw = await question(reader, stdout, "Template (1): ");
  const parsed = parseTemplateChoice(raw.trim() === "" ? "1" : raw);
  if (parsed !== undefined) return parsed;
  writeln(stdout, "Pick 1 (sketch) or 2 (game).");
  return askTemplateChoice(reader, stdout);
}

async function askInstall(
  reader: LineReader,
  stdout: NodeJS.WritableStream,
  pm: PackageManagerName,
): Promise<boolean> {
  const raw = await question(reader, stdout, `Install dependencies with ${pm}? (Y/n): `);
  const parsed = parseYesNo(raw, true);
  if (parsed !== undefined) return parsed;
  writeln(stdout, "Please answer y or n.");
  return askInstall(reader, stdout, pm);
}

async function question(
  reader: LineReader,
  stdout: NodeJS.WritableStream,
  prompt: string,
): Promise<string> {
  stdout.write(prompt);
  return reader.readLine();
}

function writeln(out: NodeJS.WritableStream, line: string): void {
  out.write(`${line}\n`);
}

/**
 * Pulls stdin a line at a time. `readline` closes itself on EOF, which is
 * exactly what a piped wizard looks like, so this stays a plain iterator.
 */
export class LineReader {
  #iterator: AsyncIterator<string>;

  constructor(input: NodeJS.ReadableStream) {
    this.#iterator = iterateLines(input);
  }

  async readLine(): Promise<string> {
    const next = await this.#iterator.next();
    if (next.done === true) return "";
    return next.value;
  }
}

async function* iterateLines(input: NodeJS.ReadableStream): AsyncGenerator<string> {
  input.setEncoding("utf8");
  let buffer = "";
  for await (const chunk of input) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      yield buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.length > 0) yield buffer.replace(/\r$/, "");
}
