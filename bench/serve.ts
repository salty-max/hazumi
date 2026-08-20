/** Static server for the GPU bench page. bun run bench/serve.ts */
// Serve the repo root so /bench and /examples are both reachable.
const root = new URL('..', import.meta.url).pathname;

Bun.serve({
  port: 5199,
  async fetch(req) {
    const url = new URL(req.url);
    const requested = url.pathname === '/' ? '/bench/gpu.html' : url.pathname;

    // Resolve before serving: without this, `/../../etc/passwd` escapes root.
    const resolved = new URL(requested.slice(1), `file://${root}`).pathname;
    if (!resolved.startsWith(root)) return new Response('Forbidden', { status: 403 });

    const file = Bun.file(resolved);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file);
  },
});

console.log('bench server on http://localhost:5199');
