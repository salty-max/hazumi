import { bloodMage } from './blood-mage';

const root = document.getElementById('root') as HTMLElement;
const readout = document.getElementById('readout') as HTMLElement;

const handle = bloodMage(root);
(window as unknown as { sketch: typeof handle }).sketch = handle;

function report(): void {
  const stats = handle.stats;
  readout.textContent = stats === null
    ? ''
    : `${stats.drawCalls} draw calls · ${stats.instances} instances`;
  requestAnimationFrame(report);
}
report();
