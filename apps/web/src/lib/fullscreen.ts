/** The screen a fullscreen scene is being presented on. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * The width to draw a canvas at so it fills a screen without distorting.
 *
 * A scene keeps its own logical size when it goes fullscreen — Starfall lays
 * its cabinet out in 600 units and would come apart if the ground moved under
 * it — so only the box the canvas is drawn into grows, and whatever is left
 * over is letterbox. Height follows from the aspect ratio the runtime already
 * puts on the element, so a width is the whole answer.
 */
export function presentWidth(bitmapWidth: number, bitmapHeight: number, screen: Viewport): number {
  if (bitmapWidth <= 0 || bitmapHeight <= 0) return 0;
  const ratio = bitmapWidth / bitmapHeight;
  return Math.floor(Math.min(screen.width, screen.height * ratio));
}

/**
 * Scale the canvas inside `host` to the screen, or put it back on its card.
 *
 * The card width is stashed on the element rather than in React state: the
 * runtime writes that inline width itself, so the only honest record of what
 * it was is what was there a moment ago.
 */
export function fitToScreen(host: HTMLElement, full: boolean, screen: Viewport): void {
  const canvas = host.querySelector("canvas");
  if (canvas === null) return;
  if (!full) {
    canvas.style.width = canvas.dataset.cardWidth ?? "";
    canvas.style.maxWidth = "100%";
    delete canvas.dataset.cardWidth;
    return;
  }
  canvas.dataset.cardWidth ??= canvas.style.width;
  canvas.style.maxWidth = "none";
  canvas.style.width = `${presentWidth(canvas.width, canvas.height, screen)}px`;
  // Keys go to the sketch that was last clicked, and going fullscreen is that
  // click — without this the arrow keys would still be pointed at the card.
  canvas.focus({ preventScroll: true });
}
