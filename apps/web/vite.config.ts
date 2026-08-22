import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const ASSETS = resolve(REPO, "examples/assets");

const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
};

function exampleAssets(): Plugin {
  return {
    name: "hazumi-example-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split("?")[0] ?? "";
        if (!url.startsWith("/examples/assets/")) {
          next();
          return;
        }
        const file = resolve(REPO, `.${url}`);
        const within = relative(ASSETS, file);
        if (within.startsWith("..") || !existsSync(file)) {
          next();
          return;
        }
        const mime = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
        response.setHeader("Content-Type", mime);
        createReadStream(file).pipe(response);
      });
    },
    writeBundle() {
      cpSync(ASSETS, join(ROOT, "dist/examples/assets"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), exampleAssets()],
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [REPO] },
  },
});
