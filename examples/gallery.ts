import type { MatterApp } from "matter/app";
import { flowField } from "./flow-field";
import { gridWaves } from "./grid-waves";
import { mouseTrail } from "./mouse-trail";
import { orbits } from "./orbits";
import { staticPoster } from "./static-poster";
import { typeSpecimen } from "./type-specimen";
import { imageGrid } from "./image-grid";
import { postBloom } from "./post-bloom";
import { petals } from "./petals";
import { tileField } from "./tile-field";
import { characters } from "./characters";
import { bloodMage } from "./blood-mage";

const SCENES: ReadonlyArray<[string, (parent: HTMLElement) => MatterApp]> = [
  ["flow field", flowField],
  ["orbits", orbits],
  ["mouse trail", mouseTrail],
  ["grid waves", gridWaves],
  ["static poster", staticPoster],
  ["type specimen", typeSpecimen],
  ["image grid", imageGrid],
  ["post bloom", postBloom],
  ["petals", petals],
  ["tile field", tileField],
  ["characters", characters],
  ["blood mage", bloodMage],
];

const root = document.getElementById("root") as HTMLElement;
const apps = new Map<string, MatterApp>();

for (const [name, run] of SCENES) {
  const cell = document.createElement("article");
  cell.className = "gallery-card";

  const label = document.createElement("div");
  label.className = "gallery-card-head";
  label.textContent = name;
  cell.append(label);

  const host = document.createElement("div");
  host.className = "gallery-host";
  cell.append(host);
  root.append(cell);

  try {
    const app = run(host);
    // Exposed so the gallery can be driven frame-by-frame in environments
    // where requestAnimationFrame is throttled, such as a hidden tab.
    apps.set(name, app);
  } catch (error) {
    label.textContent = `${name} — FAILED: ${String(error)}`;
    label.style.color = "#f2739f";
    console.error(name, error);
  }
}

(window as unknown as { galleryReady: boolean; apps: Map<string, MatterApp> }).galleryReady = true;
(window as unknown as { apps: Map<string, MatterApp> }).apps = apps;
