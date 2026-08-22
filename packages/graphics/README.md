# @hazumi/graphics

The retained command buffer: primitives, paths, style, and transforms. It
stores high-level commands (a circle, a bezier, a stroke width) and never
triangles. Tessellation belongs to a backend.

Scene code should import `hazumi/draw`. Use this package when you are writing
a renderer or asserting on the recorded stream.

Site: [hazumi-eta.vercel.app](https://hazumi-eta.vercel.app) ·
Source: [github.com/salty-max/hazumi](https://github.com/salty-max/hazumi)
