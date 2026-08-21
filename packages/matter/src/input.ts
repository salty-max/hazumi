import { getActiveContext, NoActiveSceneError } from "./active-context";
import type { GamepadInput, PointerInput } from "./context";

export { NoActiveSceneError };
export type { GamepadButtonInput, GamepadInput, PointerInput } from "./context";

/** Live input state for the application whose lifecycle callback is running. */
export interface InputState {
  readonly mouseX: number;
  readonly mouseY: number;
  readonly previousMouseX: number;
  readonly previousMouseY: number;
  readonly mouseIsPressed: boolean;
  readonly mouseButton: number;
  readonly keyIsPressed: boolean;
  readonly key: string;
  readonly pointers: readonly PointerInput[];
  readonly wheelX: number;
  readonly wheelY: number;
  readonly gamepads: readonly GamepadInput[];
}

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

export function keyIsDown(key: string): boolean {
  return getActiveContext().keyIsDown(key);
}

export function keyJustPressed(key: string): boolean {
  return getActiveContext().keyJustPressed(key);
}

export function keyJustReleased(key: string): boolean {
  return getActiveContext().keyJustReleased(key);
}

export function mouseJustPressed(button?: number): boolean {
  return getActiveContext().mouseJustPressed(button);
}

export function mouseJustReleased(button?: number): boolean {
  return getActiveContext().mouseJustReleased(button);
}

export function pointerJustPressed(pointerId?: number): boolean {
  return getActiveContext().pointerJustPressed(pointerId);
}

export function pointerJustReleased(pointerId?: number): boolean {
  return getActiveContext().pointerJustReleased(pointerId);
}

export function gamepadButtonIsDown(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonIsDown(button, gamepadIndex);
}

export function gamepadButtonJustPressed(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonJustPressed(button, gamepadIndex);
}

export function gamepadButtonJustReleased(button: number, gamepadIndex?: number): boolean {
  return getActiveContext().gamepadButtonJustReleased(button, gamepadIndex);
}
