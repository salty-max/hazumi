import { findGridIn, findSpritesIn, readImagePixels, type SliceRect } from "hazumi/assets";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { CodeBlock } from "../components/code-block";
import { Container } from "../components/container";
import { PageHeader } from "../components/page-header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";

interface Sample {
  readonly label: string;
  readonly url: string;
  /**
   * The cell size to open with.
   *
   * Almost every real sheet is packed tight in at least one direction — of the
   * five here, not one has a single empty row from edge to edge — so scanning
   * for gutters alone finds the columns and then takes the whole height as one
   * band. That is a true answer to the wrong question, and it made the tool
   * look broken on its own samples. Given the size, the scan cuts inside each
   * band and the boxes land on the art.
   */
  readonly frame: readonly [number, number];
}

/**
 * Sheets worth opening the tool on, from the gallery's own art.
 *
 * The dungeon tileset is first because it is what the tool is for: nine
 * hundred tiles packed edge to edge, which nobody is going to count by hand.
 * The interface sheet is the awkward one — panels on one grid, icons on
 * another, and no single cadence to find — and it is where dragging a region
 * over one block earns its keep.
 */
const SAMPLES: readonly Sample[] = [
  {
    label: "dungeon",
    url: "/examples/assets/oryx_16bit_fantasy_world_trans.png",
    frame: [24, 24],
  },
  {
    label: "creatures",
    url: "/examples/assets/oryx_16bit_fantasy_creatures_trans.png",
    frame: [24, 24],
  },
  { label: "interface", url: "/examples/assets/schmup/ui.png", frame: [12, 13] },
  { label: "ships", url: "/examples/assets/schmup/ships.png", frame: [8, 8] },
  { label: "projectiles", url: "/examples/assets/schmup/projectiles.png", frame: [8, 8] },
];

type Mode = "grid" | "sprites";

interface Sheet {
  readonly label: string;
  readonly bitmap: ImageBitmap;
}

/** A detected cut: the boxes to draw, and the code that reproduces them. */
interface Cut {
  readonly boxes: readonly SliceRect[];
  readonly columns: readonly number[];
  readonly rows: readonly number[];
  readonly frame: readonly [number, number];
  /** Sheet size, so the snippet can tell a full grid from a capped one. */
  readonly width: number;
  readonly height: number;
}

function toNumber(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Say a run of offsets as briefly as it can be said.
 *
 * Most sheets are on one cadence, and `spacing: 1` reads better than a list of
 * thirty numbers. Only a sheet that is genuinely irregular gets the list.
 */
function describeTrack(
  offsets: readonly number[],
  size: number,
  extent: number,
): { regular: true; margin: number; spacing: number; count: number; fits: boolean } | null {
  if (offsets.length === 0) return null;
  const margin = offsets[0] as number;
  const spacing = offsets.length > 1 ? (offsets[1] as number) - margin - size : 0;
  if (spacing < 0) return null;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] !== margin + i * (size + spacing)) return null;
  }
  const fit = Math.max(0, Math.floor((extent - margin * 2 + spacing) / (size + spacing)));
  return { regular: true, margin, spacing, count: offsets.length, fits: fit === offsets.length };
}

function frameLiteral(rect: SliceRect): string {
  return `[${rect[0]}, ${rect[1]}, ${rect[2]}, ${rect[3]}]`;
}

function nameOrDefault(names: Readonly<Record<number, string>>, index: number): string {
  const given = names[index]?.trim();
  return given === undefined || given.length === 0 ? "" : given;
}

function snippet(cut: Cut | null, mode: Mode, names: Readonly<Record<number, string>>): string {
  if (cut === null || cut.boxes.length === 0) return "// drop a sheet to slice";
  const named: string[] = [];
  for (let i = 0; i < cut.boxes.length; i++) {
    const name = nameOrDefault(names, i);
    if (name.length === 0) continue;
    const box = cut.boxes[i] as SliceRect;
    if (mode === "grid") {
      const column = cut.columns.indexOf(box[0]);
      const row = cut.rows.indexOf(box[1]);
      named.push(`    ${name}: [${column}, ${row}],`);
    } else {
      named.push(`    ${name}: ${frameLiteral(box)},`);
    }
  }
  const frames = named.length === 0 ? "" : `  frames: {\n${named.join("\n")}\n  },\n`;

  if (mode === "sprites") {
    const all =
      named.length > 0 ? named : cut.boxes.map((box, i) => `    sprite${i}: ${frameLiteral(box)},`);
    return `const sheet = spritesheet(image, {\n  frames: {\n${all.join("\n")}\n  },\n});`;
  }

  const [w, h] = cut.frame;
  const across = describeTrack(cut.columns, w, cut.width);
  const down = describeTrack(cut.rows, h, cut.height);
  const lines = [`  frame: [${w}, ${h}],`];
  if (across !== null && down !== null) {
    const spacing =
      across.spacing === down.spacing
        ? across.spacing === 0
          ? null
          : `  spacing: ${across.spacing},`
        : `  spacing: [${across.spacing}, ${down.spacing}],`;
    const margin =
      across.margin === down.margin
        ? across.margin === 0
          ? null
          : `  margin: ${across.margin},`
        : `  margin: [${across.margin}, ${down.margin}],`;
    if (spacing !== null) lines.push(spacing);
    if (margin !== null) lines.push(margin);
    if (!across.fits) lines.push(`  columns: ${across.count},`);
    if (!down.fits) lines.push(`  rows: ${down.count},`);
  } else {
    lines.push(`  columns: [${cut.columns.join(", ")}],`);
    lines.push(`  rows: [${cut.rows.join(", ")}],`);
  }
  return `const sheet = spritesheet(image, {\n${lines.join("\n")}\n${frames}});`;
}

export function SlicerPage(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mode, setMode] = useState<Mode>("grid");
  const [cellW, setCellW] = useState("");
  const [cellH, setCellH] = useState("");
  const [threshold, setThreshold] = useState(0);
  const [zoom, setZoom] = useState(4);
  const [region, setRegion] = useState<SliceRect | null>(null);
  const [drag, setDrag] = useState<SliceRect | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (label: string, blob: Blob): Promise<void> => {
    try {
      setSheet({ label, bitmap: await createImageBitmap(blob) });
      setRegion(null);
      setNames({});
      setSelected(null);
      setError(null);
    } catch {
      setError(`Could not decode ${label}.`);
    }
  }, []);

  const openSample = useCallback(
    async (sample: Sample): Promise<void> => {
      const response = await fetch(sample.url);
      if (!response.ok) {
        setError(`Could not load ${sample.url}.`);
        return;
      }
      // The size comes with the sheet. A dropped file has none, and the tool
      // scans for gutters — which is the right first guess for art nobody has
      // told it about.
      setCellW(String(sample.frame[0]));
      setCellH(String(sample.frame[1]));
      await open(sample.label, await response.blob());
    },
    [open],
  );

  useEffect(() => {
    const first = SAMPLES[0];
    if (first !== undefined) void openSample(first);
  }, [openSample]);

  const pixels = useMemo(() => (sheet === null ? null : readImagePixels(sheet.bitmap)), [sheet]);

  const cut = useMemo((): Cut | null => {
    if (pixels === null) return null;
    const scan = {
      threshold,
      ...(region === null ? {} : { region }),
    };
    if (mode === "sprites") {
      const boxes = findSpritesIn(pixels, scan);
      return {
        boxes,
        columns: [],
        rows: [],
        frame: [0, 0],
        width: pixels.width,
        height: pixels.height,
      };
    }
    const w = toNumber(cellW);
    const h = toNumber(cellH);
    const grid = findGridIn(pixels, {
      ...scan,
      ...(w !== undefined && h !== undefined ? { frame: [w, h] as const } : {}),
    });
    const boxes: SliceRect[] = [];
    for (const y of grid.rows) {
      for (const x of grid.columns) boxes.push([x, y, grid.frame[0], grid.frame[1]]);
    }
    return {
      boxes,
      columns: grid.columns,
      rows: grid.rows,
      frame: grid.frame,
      width: pixels.width,
      height: pixels.height,
    };
  }, [pixels, mode, cellW, cellH, threshold, region]);

  // Redraw whenever anything the picture depends on moves.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || sheet === null) return;
    canvas.width = sheet.bitmap.width * zoom;
    canvas.height = sheet.bitmap.height * zoom;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);

    // A checkerboard, so transparent and black are not the same colour.
    const square = 8;
    for (let y = 0; y < canvas.height; y += square) {
      for (let x = 0; x < canvas.width; x += square) {
        context.fillStyle =
          ((x / square) | 0) % 2 === ((y / square) | 0) % 2 ? "#2a2a33" : "#20202a";
        context.fillRect(x, y, square, square);
      }
    }
    context.drawImage(sheet.bitmap, 0, 0, canvas.width, canvas.height);

    const active = drag ?? region;
    if (active !== null) {
      context.fillStyle = "rgba(0, 0, 0, 0.45)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.beginPath();
      context.rect(active[0] * zoom, active[1] * zoom, active[2] * zoom, active[3] * zoom);
      context.clip();
      context.drawImage(sheet.bitmap, 0, 0, canvas.width, canvas.height);
      context.restore();
      context.strokeStyle = "#f0b429";
      context.lineWidth = 1;
      context.strokeRect(
        active[0] * zoom + 0.5,
        active[1] * zoom + 0.5,
        active[2] * zoom - 1,
        active[3] * zoom - 1,
      );
    }

    if (cut === null) return;
    context.lineWidth = 1;
    for (let i = 0; i < cut.boxes.length; i++) {
      const [x, y, w, h] = cut.boxes[i] as SliceRect;
      const isNamed = nameOrDefault(names, i).length > 0;
      context.strokeStyle =
        i === selected ? "#f0b429" : isNamed ? "#5ee0c0" : "rgba(120, 170, 255, 0.75)";
      context.strokeRect(x * zoom + 0.5, y * zoom + 0.5, w * zoom - 1, h * zoom - 1);
    }
  }, [sheet, zoom, cut, region, drag, names, selected]);

  /**
   * Where a pointer is, in sheet pixels.
   *
   * Clamped to the sheet: a drag that carries on past the edge should select to
   * the edge, not report a region larger than the image it came from.
   */
  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = sheet?.bitmap.width ?? 1;
    const height = sheet?.bitmap.height ?? 1;
    return [
      Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) / zoom))),
      Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) / zoom))),
    ];
  };

  const dragStart = useRef<[number, number] | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = pointFor(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const start = dragStart.current;
    if (start === null) return;
    const [x, y] = pointFor(event);
    setDrag([
      Math.min(start[0], x),
      Math.min(start[1], y),
      Math.abs(x - start[0]) + 1,
      Math.abs(y - start[1]) + 1,
    ]);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;
    const [x, y] = pointFor(event);
    const moved = Math.abs(x - start[0]) > 1 || Math.abs(y - start[1]) > 1;
    setDrag(null);
    if (moved) {
      // A drag limits the scan. One file usually holds several layouts, and a
      // scan of the whole thing finds the bands of neither.
      setRegion([
        Math.min(start[0], x),
        Math.min(start[1], y),
        Math.abs(x - start[0]) + 1,
        Math.abs(y - start[1]) + 1,
      ]);
      setSelected(null);
      return;
    }
    // A click picks the box under the cursor, so it can be given a name.
    const index =
      cut?.boxes.findIndex(
        ([bx, by, bw, bh]) => x >= bx && y >= by && x < bx + bw && y < by + bh,
      ) ?? -1;
    setSelected(index < 0 ? null : index);
  };

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void open(file.name, file);
  };

  const code = snippet(cut, mode, names);

  return (
    <Container className="py-14">
      <PageHeader title="Slicer">
        Drop a sheet and it tells you how it is cut. Bands of ink between the gutters become the
        grid; islands of connected pixels become sprites. Most sheets are packed tight in at least
        one direction, so give it the cell size and it cuts inside each band. Drag on the sheet to
        scan one block of it, click a box to name it, and take the call away with you.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div
          onDrop={onDrop}
          onDragOver={(event): void => event.preventDefault()}
          className="min-h-[24rem] overflow-auto rounded-xl border border-dashed border-border/70 bg-editor p-4"
        >
          {sheet === null ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Drop a PNG here, or pick one below.
            </p>
          ) : (
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="max-w-none cursor-crosshair touch-none"
              style={{ imageRendering: "pixelated" }}
            />
          )}
        </div>

        <div className="flex flex-col gap-5">
          {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Sheet
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((sample) => (
                <Button
                  key={sample.url}
                  size="sm"
                  variant={sheet?.label === sample.label ? "default" : "outline"}
                  onClick={(): void => void openSample(sample)}
                >
                  {sample.label}
                </Button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Cut
            </h2>
            <div className="flex gap-1.5">
              {(["grid", "sprites"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={mode === option ? "default" : "outline"}
                  onClick={(): void => {
                    setMode(option);
                    setSelected(null);
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
            {mode === "grid" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={cellW}
                  onChange={(event): void => setCellW(event.target.value)}
                  placeholder="cell w"
                  inputMode="numeric"
                />
                <Input
                  value={cellH}
                  onChange={(event): void => setCellH(event.target.value)}
                  placeholder="cell h"
                  inputMode="numeric"
                />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {mode === "grid"
                ? "Leave the size blank to take each band whole. Give it when the cells inside a band have no gutter between them."
                : "Eight-way connected, so a diagonal stays part of its sprite."}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Alpha threshold: {threshold}
            </h2>
            <input
              type="range"
              min={0}
              max={32}
              value={threshold}
              onChange={(event): void => setThreshold(Number(event.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Raise it when a soft edge welds two sprites into one box.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              View
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 4, 6, 8].map((step) => (
                <Button
                  key={step}
                  size="sm"
                  variant={zoom === step ? "default" : "outline"}
                  onClick={(): void => setZoom(step)}
                >
                  {step}×
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {region === null
                  ? "Whole sheet"
                  : `Region [${region[0]}, ${region[1]}, ${region[2]}, ${region[3]}]`}
              </span>
              {region === null ? null : (
                <Button size="sm" variant="ghost" onClick={(): void => setRegion(null)}>
                  Clear
                </Button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {cut === null ? "Nothing found" : `${cut.boxes.length} frames`}
            </h2>
            {mode === "grid" && cut !== null && cut.boxes.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {cut.columns.length} × {cut.rows.length} of {cut.frame[0]}×{cut.frame[1]}
              </p>
            ) : null}
            {selected === null ? (
              <p className="text-xs text-muted-foreground">Click a box on the sheet to name it.</p>
            ) : (
              <Input
                autoFocus
                value={names[selected] ?? ""}
                onChange={(event): void =>
                  setNames((current) => ({ ...current, [selected]: event.target.value }))
                }
                placeholder="name this frame"
              />
            )}
            {Object.entries(names).filter(([, value]) => value.trim().length > 0).length ===
            0 ? null : (
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(names)
                  .filter(([, value]) => value.trim().length > 0)
                  .map(([index, value]) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={(): void => setSelected(Number(index))}
                        className={cn(
                          "rounded-md border border-border/70 px-2 py-0.5 font-mono text-xs",
                          Number(index) === selected ? "border-primary text-primary" : null,
                        )}
                      >
                        {value}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="mt-8 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            The call
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={(): void => void navigator.clipboard.writeText(code)}
          >
            Copy
          </Button>
        </div>
        <CodeBlock source={code} />
      </section>
    </Container>
  );
}
