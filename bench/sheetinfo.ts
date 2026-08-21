/** Which facing is which row? Big enough to actually tell. */
const strip = document.getElementById("strip") as HTMLElement;
const out = document.getElementById("out") as HTMLElement;

const CELL = 32;
const ZOOM = 11;

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
for (let row = 0; row < 4; row++) {
  const wrap = document.createElement("div");
  wrap.className = "cellwrap";
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = `row ${row}`;
  wrap.append(tag, cellCanvas(walk, 1, row));
  block.append(wrap);
}
strip.append(block);
out.textContent = "Walk, column 1, each row at 11x";
