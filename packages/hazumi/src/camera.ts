import type { CommandBuffer } from "@hazumi/graphics";

/** Mutable point accepted as an allocation-free coordinate-conversion target. */
export interface CameraPoint {
  x: number;
  y: number;
}

/** A 2D view over world coordinates. */
export interface Camera2D {
  /** World coordinate shown at the centre of the canvas. */
  readonly x: number;
  /** World coordinate shown at the centre of the canvas. */
  readonly y: number;
  /** Screen pixels per world unit. Always finite and greater than zero. */
  readonly zoom: number;

  /** Centre the view on a world coordinate. */
  lookAt: (x: number, y: number) => void;
  /**
   * Move toward a world coordinate by `amount` (0–1).
   *
   * Called from a fixed update, the same amount produces deterministic camera
   * motion regardless of the display refresh rate. The default of 1 snaps to
   * the target.
   */
  follow: (x: number, y: number, amount?: number) => void;
  /** Set screen pixels per world unit. */
  setZoom: (zoom: number) => void;

  /**
   * Convert a world coordinate to canvas coordinates.
   *
   * Omit `out` for convenience, or pass a reused point in a hot loop to avoid
   * allocating.
   */
  worldToScreen: (x: number, y: number, out?: CameraPoint) => CameraPoint;
  /** Canvas coordinates to world coordinates; accepts a reusable output. */
  screenToWorld: (x: number, y: number, out?: CameraPoint) => CameraPoint;
  /** Draw a block in canvas coordinates, unaffected by the camera. */
  screen: (body: () => void) => void;
}

export interface CameraBundle {
  readonly camera: Camera2D;
  /** Encode the current view into a freshly reset frame buffer. */
  readonly beginFrame: () => void;
  /** Update the canvas centre while preserving an explicitly positioned view. */
  readonly resize: (width: number, height: number) => void;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function cameraOutput(out: CameraPoint | undefined): CameraPoint {
  return out ?? { x: 0, y: 0 };
}

export function createCamera2D(buffer: CommandBuffer, width: number, height: number): CameraBundle {
  let centreX = width / 2;
  let centreY = height / 2;
  let x = centreX;
  let y = centreY;
  let zoom = 1;
  let followsCanvasCentre = true;

  const writeView = (reset: boolean): void => {
    if (reset) buffer.resetTransform();

    if (zoom === 1) {
      const tx = centreX - x;
      const ty = centreY - y;
      if (tx !== 0 || ty !== 0) buffer.translate(tx, ty);
      return;
    }

    buffer.translate(centreX, centreY);
    buffer.scale(zoom, zoom);
    buffer.translate(-x, -y);
  };

  const camera: Camera2D = {
    get x(): number {
      return x;
    },
    get y(): number {
      return y;
    },
    get zoom(): number {
      return zoom;
    },

    lookAt: (nextX: number, nextY: number): void => {
      assertFinite(nextX, "camera x");
      assertFinite(nextY, "camera y");
      followsCanvasCentre = false;
      if (nextX === x && nextY === y) return;
      x = nextX;
      y = nextY;
      writeView(true);
    },

    follow: (targetX: number, targetY: number, amount = 1): void => {
      assertFinite(targetX, "camera target x");
      assertFinite(targetY, "camera target y");
      if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
        throw new RangeError("camera follow amount must be between 0 and 1");
      }
      const nextX = x + (targetX - x) * amount;
      const nextY = y + (targetY - y) * amount;
      if (nextX === x && nextY === y) return;
      followsCanvasCentre = false;
      x = nextX;
      y = nextY;
      writeView(true);
    },

    setZoom: (nextZoom: number): void => {
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
        throw new RangeError("camera zoom must be a finite positive number");
      }
      if (nextZoom === zoom) return;
      zoom = nextZoom;
      writeView(true);
    },

    worldToScreen: (worldX: number, worldY: number, out?: CameraPoint): CameraPoint => {
      const point = cameraOutput(out);
      point.x = (worldX - x) * zoom + centreX;
      point.y = (worldY - y) * zoom + centreY;
      return point;
    },

    screenToWorld: (screenX: number, screenY: number, out?: CameraPoint): CameraPoint => {
      const point = cameraOutput(out);
      point.x = (screenX - centreX) / zoom + x;
      point.y = (screenY - centreY) / zoom + y;
      return point;
    },

    screen: (body: () => void): void => {
      buffer.resetTransform();
      try {
        body();
      } finally {
        // Clear any transforms the HUD used, then restore the world view for
        // drawing that follows. Style is deliberately left untouched.
        writeView(true);
      }
    },
  };

  const resize = (nextWidth: number, nextHeight: number): void => {
    const nextCentreX = nextWidth / 2;
    const nextCentreY = nextHeight / 2;
    if (followsCanvasCentre) {
      x = nextCentreX;
      y = nextCentreY;
    }
    centreX = nextCentreX;
    centreY = nextCentreY;
  };

  return { camera, beginFrame: (): void => writeView(false), resize };
}
