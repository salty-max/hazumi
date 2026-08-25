import { getActiveContext, NoActiveSceneError } from "./active-context";
import type { GamepadInput, PointerInput } from "./context";

export { NoActiveSceneError };
export type { GamepadButtonInput, GamepadInput, PointerInput } from "./context";

/** Live input state for the application whose lifecycle callback is running. */
export interface InputState {
  /** Pointer position in logical canvas coordinates, not page coordinates. */
  readonly mouseX: number;
  /** Pointer position in logical canvas coordinates. */
  readonly mouseY: number;
  /** Where it was at the end of the previous fixed update — a drag delta's other half. */
  readonly previousMouseX: number;
  /** Where it was at the end of the previous fixed update. */
  readonly previousMouseY: number;
  /** Whether any mouse button is down. */
  readonly mouseIsPressed: boolean;
  /** The most recent button: 0 left, 1 middle, 2 right. */
  readonly mouseButton: number;
  /** Whether any key is down. */
  readonly keyIsPressed: boolean;
  /** The most recent key, as `KeyboardEvent.key`. */
  readonly key: string;
  /** Every live contact — mouse, pen and touch alike. Empty when nothing is on the canvas. */
  readonly pointers: readonly PointerInput[];
  /** Horizontal wheel movement since the last update, in pixels. */
  readonly wheelX: number;
  /** Vertical wheel movement since the last update, in pixels. */
  readonly wheelY: number;
  /** Connected gamepads, indexed by slot. */
  readonly gamepads: readonly GamepadInput[];
}

/**
 * The live input snapshot, read as plain properties: `input.mouseX`.
 *
 * A getter object rather than a value, so it always reports the running
 * application — there is nothing to refresh and nothing to pass around.
 */
export const input: InputState = {
  get mouseX(): number {
    return getActiveContext().mouseX;
  },
  get mouseY(): number {
    return getActiveContext().mouseY;
  },
  get previousMouseX(): number {
    return getActiveContext().pmouseX;
  },
  get previousMouseY(): number {
    return getActiveContext().pmouseY;
  },
  get mouseIsPressed(): boolean {
    return getActiveContext().mouseIsPressed;
  },
  get mouseButton(): number {
    return getActiveContext().mouseButton;
  },
  get keyIsPressed(): boolean {
    return getActiveContext().keyIsPressed;
  },
  get key(): string {
    return getActiveContext().key;
  },
  get pointers(): readonly PointerInput[] {
    return getActiveContext().pointers;
  },
  get wheelX(): number {
    return getActiveContext().wheelX;
  },
  get wheelY(): number {
    return getActiveContext().wheelY;
  },
  get gamepads(): readonly GamepadInput[] {
    return getActiveContext().gamepads;
  },
};

/**
 * Whether a key is held right now.
 *
 * Takes a `KeyboardEvent.key` value — `'a'`, `'ArrowLeft'`, `' '` — rather than
 * a numeric code, so it reads the same as what the event reports.
 */
export function keyIsDown(key: string): boolean {
  return getActiveContext().keyIsDown(key);
}

/**
 * True only during the first update after the key goes down.
 *
 * Edge, not level: this is what a jump or a menu confirm wants, and it is
 * cleared once per fixed update rather than per frame.
 */
export function keyJustPressed(key: string): boolean {
  return getActiveContext().keyJustPressed(key);
}

/** True only during the first update after the key comes back up. */
export function keyJustReleased(key: string): boolean {
  return getActiveContext().keyJustReleased(key);
}

/** Edge for a mouse button. Defaults to the left one. */
export function mouseJustPressed(button?: number): boolean {
  return getActiveContext().mouseJustPressed(button);
}

/** Release edge for a mouse button. Defaults to the left one. */
export function mouseJustReleased(button?: number): boolean {
  return getActiveContext().mouseJustReleased(button);
}

/**
 * Press edge for a pointer: mouse, pen or touch alike.
 *
 * Without an id, any pointer counts — which is what a scene that just wants
 * "was the canvas tapped" should ask, so it works on a phone too.
 */
export function pointerJustPressed(pointerId?: number): boolean {
  return getActiveContext().pointerJustPressed(pointerId);
}

/** Release edge for a pointer. Without an id, any pointer counts. */
export function pointerJustReleased(pointerId?: number): boolean {
  return getActiveContext().pointerJustReleased(pointerId);
}

/**
 * Whether a gamepad button is held, by its index in the standard mapping.
 *
 * Defaults to the first pad. A disconnected pad reports everything up rather
 * than throwing, so a scene need not check before asking.
 */
export function gamepadButtonIsDown(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonIsDown(button, gamepadIndex);
}

/** Press edge for a gamepad button. Defaults to the first pad. */
export function gamepadButtonJustPressed(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonJustPressed(button, gamepadIndex);
}

/** Release edge for a gamepad button. Defaults to the first pad. */
export function gamepadButtonJustReleased(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonJustReleased(button, gamepadIndex);
}
