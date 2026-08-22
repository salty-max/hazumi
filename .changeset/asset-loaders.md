---
"hazumi": minor
---

Load more than images.

`loadText`, `loadJson` and `loadFont` join `loadImage`. Asset loading stopped at
images, which meant no way to read a level file, and no way for a game to ship
its own typeface — text drawing could only use fonts the system already had.

They are plain async functions taking a URL, because a scene factory is already
async: `await loadJson("level.json")` in setup needs no preload phase and no
loader to thread around. Each takes an optional `fetch`, so a test can inject a
transport instead of stubbing a global.

Failures now throw `AssetLoadError` rather than a bare `Error`, carrying the URL
and — when the request completed — the status, so a 404 and a dropped connection
are distinguishable. Invalid JSON says which file rather than surfacing a
`SyntaxError` with no context.

Deliberately uncached: the browser already caches the bytes, and a module-level
map keyed by URL is an unbounded cache with no owner that would hold every asset
any scene ever touched for the life of the page.
