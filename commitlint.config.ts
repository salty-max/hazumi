import type { UserConfig } from "@commitlint/types";

/**
 * Scopes mirror the workspace layout. Adding a package means adding its scope
 * here, so commit history stays greppable by subsystem.
 */
const scopes = [
  "core",
  "math",
  "color",
  "audio",
  "physics",
  "graphics",
  "webgl2",
  "canvas2d",
  // Cross-cutting changes to the backend contract, which no single package
  // scope describes honestly.
  "backends",
  "svg",
  "headless",
  "hazumi",
  "vite-plugin",
  "create-hazumi",
  "docs",
  "playground",
  "examples",
  "repo",
  "deps",
];

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", scopes],
    "body-max-line-length": [0, "always"],
    "footer-max-line-length": [0, "always"],
  },
};

export default config;
