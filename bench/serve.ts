/** Static server for the GPU bench page. bun run bench/serve.ts */
const root = new URL('.', import.meta.url).pathname;

Bun.serve({
  port: 5199,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === '/' ? '/gpu.html' : url.pathname;
    return new Response(Bun.file(root + path.slice(1)));
  },
});

console.log('bench server on http://localhost:5199');
