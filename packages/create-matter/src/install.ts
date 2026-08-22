import { spawn } from "node:child_process";

import type { PackageManagerName } from "./files";
import { UserError } from "./errors";

export function detectPackageManager(
  userAgent: string | undefined = process.env["npm_config_user_agent"],
): PackageManagerName {
  const name = userAgent?.split(" ")[0]?.split("/")[0];
  if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return name;
  return "bun";
}

export function spawnArgs(pm: PackageManagerName): {
  readonly command: string;
  readonly args: readonly string[];
} {
  if (pm === "yarn") return { command: "yarn", args: [] };
  return { command: pm, args: ["install"] };
}

export function installDependencies(directory: string, pm: PackageManagerName): Promise<number> {
  const { command, args } = spawnArgs(pm);
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: directory,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      reject(new UserError(`Could not run ${command}: ${error.message}`));
    });
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}
