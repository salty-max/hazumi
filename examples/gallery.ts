import { flowField } from './flow-field';
import { gridWaves } from './grid-waves';
import { mouseTrail } from './mouse-trail';
import { orbits } from './orbits';
import { staticPoster } from './static-poster';

const SKETCHES: ReadonlyArray<[string, (parent: HTMLElement) => void]> = [
  ['flow field', flowField],
  ['orbits', orbits],
  ['mouse trail', mouseTrail],
  ['grid waves', gridWaves],
  ['static poster', staticPoster],
];

const root = document.getElementById('root') as HTMLElement;

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
    run(host);
  } catch (error) {
    label.textContent = `${name} — FAILED: ${String(error)}`;
    label.style.color = '#f2739f';
    console.error(name, error);
  }
}

(window as unknown as { galleryReady: boolean }).galleryReady = true;
