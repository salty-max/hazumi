import type { SketchHandle } from 'matter';
import { flowField } from './flow-field';
import { gridWaves } from './grid-waves';
import { mouseTrail } from './mouse-trail';
import { orbits } from './orbits';
import { staticPoster } from './static-poster';
import { typeSpecimen } from './type-specimen';
import { imageGrid } from './image-grid';
import { postBloom } from './post-bloom';
import { petals } from './petals';
import { tileField } from './tile-field';
import { characters } from './characters';
import { bloodMage } from './blood-mage';

const SKETCHES: ReadonlyArray<[string, (parent: HTMLElement) => SketchHandle | void]> = [
  ['flow field', flowField],
  ['orbits', orbits],
  ['mouse trail', mouseTrail],
  ['grid waves', gridWaves],
  ['static poster', staticPoster],
  ['type specimen', typeSpecimen],
  ['image grid', imageGrid],
  ['post bloom', postBloom],
  ['petals', petals],
  ['tile field', tileField],
  ['characters', characters],
  ['blood mage', bloodMage],
];

const root = document.getElementById('root') as HTMLElement;
const handles = new Map<string, SketchHandle>();

for (const [name, run] of SKETCHES) {
  const cell = document.createElement('div');
  cell.className = 'cell';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = name;
  cell.append(label);

  const host = document.createElement('div');
  cell.append(host);
  root.append(cell);

  try {
    const handle = run(host);
    // Exposed so the gallery can be driven frame-by-frame in environments
    // where requestAnimationFrame is throttled, such as a hidden tab.
    if (handle !== undefined) handles.set(name, handle);
  } catch (error) {
    label.textContent = `${name} — FAILED: ${String(error)}`;
    label.style.color = '#f2739f';
    console.error(name, error);
  }
}

(window as unknown as { galleryReady: boolean; sketches: Map<string, SketchHandle> }).galleryReady =
  true;
(window as unknown as { sketches: Map<string, SketchHandle> }).sketches = handles;
