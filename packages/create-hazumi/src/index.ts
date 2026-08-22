#!/usr/bin/env node

import { isUserError } from "./errors";
import { run } from "./cli";

void run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (isUserError(error)) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  },
);
