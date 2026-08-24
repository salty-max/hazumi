/**
 * Browser harness for `bun run capture:examples`.
 * Not linked from the site — Vite serves it as /capture.html in dev.
 */
import { bloodMage } from "../../../examples/blood-mage";
import { characters } from "../../../examples/characters";
import { flowField } from "../../../examples/flow-field";
import { gridWaves } from "../../../examples/grid-waves";
import { petals } from "../../../examples/petals";
import { postBloom } from "../../../examples/post-bloom";
import { raycaster } from "../../../examples/raycaster";
import { shmup } from "../../../examples/shmup";
import type { HazumiApp } from "hazumi/app";

type ExampleFn = (parent: HTMLElement) => HazumiApp;

const SCENES: Readonly<Record<string, ExampleFn>> = {
  "blood-mage": bloodMage,
  characters,
  "flow-field": flowField,
  "grid-waves": gridWaves,
  petals,
  "post-bloom": postBloom,
  raycaster,
  starfall: shmup,
};

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function waitUntil(deadline: number): Promise<void> {
  if (performance.now() >= deadline) return Promise.resolve();
  return waitFrame().then(() => waitUntil(deadline));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

async function capturePreview(name: string, warmupMs: number, hold?: string): Promise<string> {
  const run = SCENES[name];
  if (run === undefined) throw new Error(`Unknown scene: ${name}`);

  const host = document.createElement("div");
  document.body.append(host);
  const app = run(host);
  try {
    await app.ready;
    // A game opens on its menu and stays there. Holding the key that starts it
    // — and, for a shooter, the same key that fires — gets the gallery a still
    // of the game being played rather than of its title card.
    if (hold !== undefined) {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: hold }));
    }
    await waitUntil(performance.now() + warmupMs);
    app.redraw();
    return blobToBase64(await app.capturePng());
  } finally {
    if (hold !== undefined) globalThis.dispatchEvent(new KeyboardEvent("keyup", { key: hold }));
    app.stop();
    host.remove();
  }
}

(globalThis as unknown as { capturePreview: typeof capturePreview }).capturePreview =
  capturePreview;
