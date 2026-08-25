---
"hazumi": patch
"@hazumi/math": patch
---

Every public symbol now carries a description in its published types.

141 of the 304 exports had none — 46%, and `hazumi/draw` was the worst of them
at 28. Much of the missing knowledge already existed as implementation comments
where nothing consuming the types could reach it: that `circle` takes a diameter
rather than a radius, that `point` follows stroke instead of fill, that
`blendMode` is the one piece of style that ends a batch.

The seven namespaces `@hazumi/math` publishes — `vec2`, `vec3`, `mat4`,
`easing`, `collision`, `pathfind`, `physics` — were a different problem. The
d.ts bundler rewrites `export * as vec2` into a synthesized `declare namespace`
and drops the comment on the way, so hovering `vec2.add` explained itself and
hovering `vec2` said nothing. A build step puts them back, and throws if it ever
stops finding its target rather than quietly shipping bare types again.
