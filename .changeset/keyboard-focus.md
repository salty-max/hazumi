---
"hazumi": minor
---

Keys go to the sketch you clicked, not to every sketch on the page.

Pointer events already belong to the canvas they land on. Keys have no such
home — they arrive at the window — so until now every running application
received every keystroke. A page with several of them answered a single press
all at once: the space bar that fired a shot in one also restarted the
motorbike two cards down. The same listeners called `preventDefault` on the
arrow keys and the space bar, so the page could not be scrolled from the
keyboard at all.

The rule now:

- **One sketch on the page** takes the keys straight away, as before. Asking
  someone to click a canvas before the arrow keys do anything is a poor first
  five seconds, and nothing else on the page could want them — unless they are
  typing in a field, which always wins.
- **Several sketches** have no such default. The keys go to whichever one holds
  focus, and to no other. `pointerdown` already focuses the canvas, so that is
  the same click that starts playing.

Releases are still taken whoever they were meant for: a key held while focus
moves elsewhere would otherwise stay down for good.
