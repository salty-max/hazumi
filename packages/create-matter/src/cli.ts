import { relative } from "node:path";

import { HELP, parseArgs } from "./args";
import { isUserError, UserError } from "./errors";
import type { PackageManagerName } from "./files";
import { installCommand, runCommand } from "./files";
import { detectPackageManager, installDependencies } from "./install";
import { findPackageRoot, readOwnVersion, resolveLocalSpecs } from "./local";
import { resolveAnswers, type WizardIo } from "./prompt";
import { scaffold } from "./scaffold";

export interface RunOptions {
  readonly cwd?: string;
  readonly stdin?: NodeJS.ReadableStream;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  readonly env?: NodeJS.ProcessEnv;
  readonly packageRoot?: string;
  readonly install?: (directory: string, pm: PackageManagerName) => Promise<number>;
}

export async function run(argv: readonly string[], options: RunOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const stdin = options.stdin ?? process.stdin;
  const env = options.env ?? process.env;

  try {
    return await runInner(argv, { cwd, stdout, stderr, stdin, env, options });
  } catch (error) {
    if (isUserError(error)) {
      writeln(stderr, error.message);
      return error.exitCode;
    }
    throw error;
  }
}

async function runInner(
  argv: readonly string[],
  ctx: {
    readonly cwd: string;
    readonly stdout: NodeJS.WritableStream;
    readonly stderr: NodeJS.WritableStream;
    readonly stdin: NodeJS.ReadableStream;
    readonly env: NodeJS.ProcessEnv;
    readonly options: RunOptions;
  },
): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    writeln(ctx.stdout, HELP.trimEnd());
    return 0;
  }

  const pm = detectPackageManager(ctx.env["npm_config_user_agent"]);
  const io: WizardIo = { stdin: ctx.stdin, stdout: ctx.stdout };
  const answers = await resolveAnswers(args, ctx.cwd, io, pm);

  const packageRoot = ctx.options.packageRoot ?? findPackageRoot();
  const version = readOwnVersion(packageRoot);
  const local = answers.local ? resolveLocalSpecs(packageRoot) : undefined;
  const matterSpec = local?.matterSpec ?? `^${version}`;
  const vitePluginSpec = local?.vitePluginSpec ?? `^${version}`;

  const result = scaffold({
    directory: answers.target.directory,
    name: answers.target.name,
    template: answers.template,
    autoImport: answers.autoImport,
    matterSpec,
    vitePluginSpec,
    packageManager: pm,
    overrides: local?.overrides ?? {},
  });

  writeln(ctx.stdout, "");
  writeln(
    ctx.stdout,
    `Wrote ${result.files.length} files to ${displayPath(ctx.cwd, result.directory)}.`,
  );

  if (answers.install) {
    const installer = ctx.options.install ?? installDependencies;
    const code = await installer(result.directory, pm);
    if (code !== 0) {
      throw new UserError(`${pm} install failed (exit ${code}).`, code);
    }
  }

  printNextSteps(ctx.stdout, ctx.cwd, result.directory, pm, answers.install);
  return 0;
}

function printNextSteps(
  stdout: NodeJS.WritableStream,
  cwd: string,
  directory: string,
  pm: PackageManagerName,
  installed: boolean,
): void {
  const rel = displayPath(cwd, directory);
  const runCmd = runCommand(pm);
  writeln(stdout, "");
  writeln(stdout, "Next:");
  if (rel !== ".") {
    writeln(stdout, `  cd ${rel}`);
  }
  if (!installed) {
    writeln(stdout, `  ${installCommand(pm)}`);
  }
  writeln(stdout, `  ${runCmd} dev`);
  writeln(stdout, "");
  writeln(stdout, `${runCmd} build writes dist/. Zip that folder to ship the project.`);
}

function displayPath(cwd: string, directory: string): string {
  const rel = relative(cwd, directory);
  return rel.length === 0 ? "." : rel;
}

function writeln(out: NodeJS.WritableStream, line: string): void {
  out.write(`${line}\n`);
}
