import { bloodMage } from "./blood-mage";

const root = document.getElementById("root") as HTMLElement;
const readout = document.getElementById("readout") as HTMLElement;

const app = bloodMage(root);
(window as unknown as { app: typeof app }).app = app;

function report(): void {
  const stats = app.stats;
  readout.textContent =
    stats === null ? "" : `${stats.drawCalls} draw calls · ${stats.instances} instances`;
  requestAnimationFrame(report);
}
report();
