/** Confirmed Blood Mage facing order: two left/right mirror pairs, front then back. */
const strip = document.getElementById("strip") as HTMLElement;
const out = document.getElementById("out") as HTMLElement;

const CELL = 32;
const ZOOM = 11;
const FACINGS = ["frontLeft", "frontRight", "backLeft", "backRight"] as const;

async function load(name: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `../examples/assets/blood-mage/${name}.png`;
  await img.decode();
  return img;
}

function cellCanvas(img: HTMLImageElement, col: number, row: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CELL * ZOOM;
  c.height = CELL * ZOOM;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#2a2438";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, col * CELL, row * CELL, CELL, CELL, 0, 0, c.width, c.height);
  return c;
}

const walk = await load("Walk");
const block = document.createElement("div");
block.className = "line";
for (const [row, facing] of FACINGS.entries()) {
  const wrap = document.createElement("div");
  wrap.className = "cellwrap";
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = facing;
  wrap.append(tag, cellCanvas(walk, 1, row));
  block.append(wrap);
}
strip.append(block);
out.textContent = "Walk, column 1 — frontLeft, frontRight, backLeft, backRight";
