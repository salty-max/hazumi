import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const routes: Readonly<Record<string, string>> = {
  "/playground": "/apps/playground/index.html",
  "/playground/": "/apps/playground/index.html",
  "/reference": "/apps/docs/dist/index.html",
  "/reference/": "/apps/docs/dist/index.html",
  "/examples": "/examples/gallery.html",
  "/examples/": "/examples/gallery.html",
};

function cleanRoutes(): Plugin {
  return {
    name: "hazumi-clean-routes",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === undefined) {
          next();
          return;
        }

        const [pathname, query] = request.url.split("?", 2);
        // The playground keeps a relative entry so its standalone Vite build
        // also works. At the clean route, the browser resolves it from `/`.
        const route =
          pathname === "/src/main.tsx"
            ? "/apps/playground/src/main.tsx"
            : pathname === undefined
              ? undefined
              : routes[pathname];
        if (route !== undefined) request.url = query === undefined ? route : `${route}?${query}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cleanRoutes(), react(), tailwindcss()],
  server: {
    port: 5199,
    strictPort: true,
  },
});
