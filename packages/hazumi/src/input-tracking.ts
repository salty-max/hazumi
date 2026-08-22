/**
 * Buffered input, folded into fixed-update snapshots.
 *
 * Browser input events arrive whenever they arrive; a fixed-step simulation
 * needs to see each transition exactly once, on a tick. So every edge is
 * buffered here as it happens and handed over in `beginStep`, which swaps the
 * pending set with the live one rather than allocating a new one per tick.
 *
 * That buffering is why this is worth its own module: it is the only part of
 * the runtime that has to be correct about *when* something happened rather
 * than what is currently true, and it carries the awkward cases — a tap that
 * begins and ends between two ticks, key repeat that must not read as a fresh
 * press, and a release that never fires because the window lost focus.
 *
 * It owns no clock and no rendering. `state` is the shared context state it
 * writes into; the application decides when to step.
 */
import type { ContextState } from "./context";
import type { GamepadButtonInput, GamepadInput, PointerInput } from "./context";

interface MutablePointerInput extends PointerInput {
  id: number;
  type: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  pressure: number;
  isPrimary: boolean;
  isPressed: boolean;
}

interface MutableGamepadButtonInput extends GamepadButtonInput {
  value: number;
  pressed: boolean;
  touched: boolean;
}

interface MutableGamepadInput extends GamepadInput {
  id: string;
  mapping: string;
  connected: boolean;
  axes: number[];
  buttons: MutableGamepadButtonInput[];
  seen: boolean;
}

function addGamepadEdge(edges: Map<number, Set<number>>, index: number, button: number): void {
  let buttons = edges.get(index);
  if (buttons === undefined) {
    buttons = new Set<number>();
    edges.set(index, buttons);
  }
  buttons.add(button);
}

const PAGE_SCROLL_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof target !== "object" || target === null || !("tagName" in target)) return false;
  const element = target as {
    readonly tagName: string;
    readonly isContentEditable?: boolean;
  };
  if (element.isContentEditable === true) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function shouldPreventPageScroll(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!PAGE_SCROLL_KEYS.has(event.key)) return false;
  if (isEditableTarget(event.target)) return false;
  // Space activates a focused button or link; leave that to the browser.
  if (event.key === " " && typeof event.target === "object" && event.target !== null) {
    const element = event.target as {
      readonly tagName?: string;
      getAttribute?: (name: string) => string | null;
    };
    const tag = element.tagName;
    const role = element.getAttribute?.("role");
    if (tag === "BUTTON" || tag === "A" || role === "button" || role === "link") return false;
  }
  return true;
}

/** Attach/detach the listeners, and fold buffered edges onto the fixed clock. */
export interface InputTracking {
  readonly attach: () => void;
  readonly detach: () => void;
  /** Hand this tick its transitions, and poll gamepads. */
  readonly beginStep: () => void;
  /** Clear the transitions once the tick has read them. */
  readonly endStep: () => void;
}

export function createInputTracking(state: ContextState, canvas: HTMLCanvasElement): InputTracking {
  // Iterating the array beats indexing it: `noUncheckedIndexedAccess` cannot
  // prove an index is in range, so the indexed form needed a non-null assertion
  // to say what `for...of` says for free.
  const clearGamepadEdges = (edges: Map<number, Set<number>>): void => {
    for (const gamepad of state.gamepads) edges.get(gamepad.index)?.clear();
  };

  let pendingKeysPressed = new Set<string>();
  let pendingKeysReleased = new Set<string>();
  let pendingMouseButtonsPressed = new Set<number>();
  let pendingMouseButtonsReleased = new Set<number>();
  let pendingPointersPressed = new Set<number>();
  let pendingPointersReleased = new Set<number>();
  let pendingWheelX = 0;
  let pendingWheelY = 0;
  const mouseButtonsDown = new Set<number>();
  const pointersById = new Map<number, MutablePointerInput>();
  const gamepadsByIndex = new Map<number, MutableGamepadInput>();
  const getGamepads = globalThis.navigator?.getGamepads?.bind(globalThis.navigator);

  const pollGamepads = (): void => {
    if (getGamepads === undefined) return;
    for (let index = 0; index < state.gamepads.length; index++) {
      (state.gamepads[index] as MutableGamepadInput).seen = false;
    }

    const nativeGamepads = getGamepads();
    for (let nativeIndex = 0; nativeIndex < nativeGamepads.length; nativeIndex++) {
      const native = nativeGamepads[nativeIndex];
      if (native === undefined || native === null || !native.connected) continue;

      let input = gamepadsByIndex.get(native.index);
      if (input === undefined) {
        input = {
          index: native.index,
          id: native.id,
          mapping: native.mapping,
          connected: true,
          axes: [],
          buttons: [],
          seen: true,
        };
        gamepadsByIndex.set(native.index, input);
        let insertion = state.gamepads.length;
        while (insertion > 0 && state.gamepads[insertion - 1]!.index > native.index) insertion--;
        state.gamepads.splice(insertion, 0, input);
      }

      input.seen = true;
      input.connected = true;
      input.id = native.id;
      input.mapping = native.mapping;
      input.axes.length = native.axes.length;
      for (let axis = 0; axis < native.axes.length; axis++) input.axes[axis] = native.axes[axis]!;

      for (let button = 0; button < native.buttons.length; button++) {
        const source = native.buttons[button]!;
        let target = input.buttons[button];
        if (target === undefined) {
          target = { value: 0, pressed: false, touched: false };
          input.buttons[button] = target;
        }
        if (source.pressed !== target.pressed) {
          addGamepadEdge(
            source.pressed ? state.gamepadButtonsPressed : state.gamepadButtonsReleased,
            native.index,
            button,
          );
        }
        target.value = source.value;
        target.pressed = source.pressed;
        target.touched = source.touched;
      }
      for (let button = native.buttons.length; button < input.buttons.length; button++) {
        if (input.buttons[button]!.pressed) {
          addGamepadEdge(state.gamepadButtonsReleased, native.index, button);
        }
      }
      input.buttons.length = native.buttons.length;
    }

    for (let index = 0; index < state.gamepads.length; index++) {
      const input = state.gamepads[index] as MutableGamepadInput;
      if (input.seen || !input.connected) continue;
      input.connected = false;
      for (let button = 0; button < input.buttons.length; button++) {
        const target = input.buttons[button]!;
        if (target.pressed) addGamepadEdge(state.gamepadButtonsReleased, input.index, button);
        target.value = 0;
        target.pressed = false;
        target.touched = false;
      }
    }
  };
  const pointerPosition = (event: PointerEvent): readonly [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : state.width / rect.width;
    const scaleY = rect.height === 0 ? 1 : state.height / rect.height;
    return [(event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY];
  };
  const updatePointer = (event: PointerEvent): MutablePointerInput => {
    const [x, y] = pointerPosition(event);
    let pointer = pointersById.get(event.pointerId);
    if (pointer === undefined) {
      pointer = {
        id: event.pointerId,
        type: event.pointerType || "mouse",
        x,
        y,
        previousX: x,
        previousY: y,
        pressure: event.pressure,
        isPrimary: event.isPrimary,
        isPressed: false,
      };
      pointersById.set(event.pointerId, pointer);
      state.pointers.push(pointer);
    } else {
      pointer.type = event.pointerType || pointer.type;
      pointer.x = x;
      pointer.y = y;
      pointer.pressure = event.pressure;
      pointer.isPrimary = event.isPrimary;
    }
    if (event.isPrimary) {
      state.mouseX = x;
      state.mouseY = y;
    }
    return pointer;
  };
  const onPointerMove = (event: PointerEvent): void => {
    updatePointer(event);
  };
  const onPointerLeave = (event: PointerEvent): void => {
    const pointer = pointersById.get(event.pointerId);
    if (
      pointer === undefined ||
      pointer.isPressed ||
      pendingPointersReleased.has(event.pointerId) ||
      state.pointersReleased.has(event.pointerId)
    ) {
      return;
    }
    pointersById.delete(event.pointerId);
    const index = state.pointers.indexOf(pointer);
    if (index !== -1) state.pointers.splice(index, 1);
  };
  const onPointerDown = (event: PointerEvent): void => {
    const pointer = updatePointer(event);
    if (!pointer.isPressed) pendingPointersPressed.add(event.pointerId);
    pointer.isPressed = true;
    if (event.isPrimary) {
      if (!mouseButtonsDown.has(event.button)) pendingMouseButtonsPressed.add(event.button);
      mouseButtonsDown.add(event.button);
      state.mouseIsPressed = true;
      state.mouseButton = event.button;
    }
    canvas.setPointerCapture?.(event.pointerId);
    canvas.focus?.({ preventScroll: true });
  };
  const onPointerEnd = (event: PointerEvent): void => {
    // Pointer-up is global so a drag can finish outside the canvas, but events
    // that began on another element do not belong to this application.
    if (!pointersById.has(event.pointerId)) return;
    const pointer = updatePointer(event);
    const cancelled = event.type === "pointercancel";
    const stillPressed = !cancelled && event.buttons !== 0;
    if (pointer.isPressed && !stillPressed) pendingPointersReleased.add(event.pointerId);
    pointer.isPressed = stillPressed;
    if (!stillPressed) pointer.pressure = 0;
    if (event.isPrimary) {
      if (cancelled) {
        for (const button of mouseButtonsDown) pendingMouseButtonsReleased.add(button);
        mouseButtonsDown.clear();
      } else if (mouseButtonsDown.delete(event.button)) {
        pendingMouseButtonsReleased.add(event.button);
      }
      state.mouseIsPressed = mouseButtonsDown.size > 0;
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
    pendingWheelX += event.deltaX * scale;
    pendingWheelY += event.deltaY * scale;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (shouldPreventPageScroll(event)) event.preventDefault();
    if (!state.keysDown.has(event.key)) pendingKeysPressed.add(event.key);
    state.keyIsPressed = true;
    state.key = event.key;
    state.keysDown.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (state.keysDown.delete(event.key)) pendingKeysReleased.add(event.key);
    state.keyIsPressed = state.keysDown.size > 0;
  };
  const onBlur = (): void => {
    // A key released while the window is unfocused never fires keyup, so it
    // would stay held forever. Clearing on blur is the only way to notice.
    for (const key of state.keysDown) pendingKeysReleased.add(key);
    state.keysDown.clear();
    state.keyIsPressed = false;
    for (const button of mouseButtonsDown) pendingMouseButtonsReleased.add(button);
    mouseButtonsDown.clear();
    state.mouseIsPressed = false;
    for (const pointer of state.pointers) {
      if (!pointer.isPressed) continue;
      pendingPointersReleased.add(pointer.id);
      const mutable = pointer as MutablePointerInput;
      mutable.isPressed = false;
      mutable.pressure = 0;
    }
  };
  const beginInputStep = (): void => {
    let previous = state.keysPressed;
    state.keysPressed = pendingKeysPressed;
    pendingKeysPressed = previous;

    previous = state.keysReleased;
    state.keysReleased = pendingKeysReleased;
    pendingKeysReleased = previous;

    let previousButtons = state.mouseButtonsPressed;
    state.mouseButtonsPressed = pendingMouseButtonsPressed;
    pendingMouseButtonsPressed = previousButtons;

    previousButtons = state.mouseButtonsReleased;
    state.mouseButtonsReleased = pendingMouseButtonsReleased;
    pendingMouseButtonsReleased = previousButtons;

    let previousPointers = state.pointersPressed;
    state.pointersPressed = pendingPointersPressed;
    pendingPointersPressed = previousPointers;

    previousPointers = state.pointersReleased;
    state.pointersReleased = pendingPointersReleased;
    pendingPointersReleased = previousPointers;

    state.wheelX = pendingWheelX;
    state.wheelY = pendingWheelY;
    pendingWheelX = 0;
    pendingWheelY = 0;
    pollGamepads();
  };
  const endInputStep = (): void => {
    state.keysPressed.clear();
    state.keysReleased.clear();
    state.mouseButtonsPressed.clear();
    state.mouseButtonsReleased.clear();
    state.wheelX = 0;
    state.wheelY = 0;
    for (let index = state.pointers.length - 1; index >= 0; index--) {
      const pointer = state.pointers[index] as MutablePointerInput;
      if (!pointer.isPressed && state.pointersReleased.has(pointer.id)) {
        pointersById.delete(pointer.id);
        state.pointers.splice(index, 1);
      } else {
        pointer.previousX = pointer.x;
        pointer.previousY = pointer.y;
      }
    }
    state.pointersPressed.clear();
    state.pointersReleased.clear();
    clearGamepadEdges(state.gamepadButtonsPressed);
    clearGamepadEdges(state.gamepadButtonsReleased);
    for (let index = state.gamepads.length - 1; index >= 0; index--) {
      const gamepad = state.gamepads[index]!;
      if (gamepad.connected) continue;
      gamepadsByIndex.delete(gamepad.index);
      state.gamepadButtonsPressed.delete(gamepad.index);
      state.gamepadButtonsReleased.delete(gamepad.index);
      state.gamepads.splice(index, 1);
    }
  };

  return {
    attach: (): void => {
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerleave", onPointerLeave);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      globalThis.addEventListener("pointerup", onPointerEnd);
      globalThis.addEventListener("pointercancel", onPointerEnd);
      globalThis.addEventListener("keydown", onKeyDown);
      globalThis.addEventListener("keyup", onKeyUp);
      globalThis.addEventListener("blur", onBlur);
    },
    detach: (): void => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("wheel", onWheel);
      globalThis.removeEventListener("pointerup", onPointerEnd);
      globalThis.removeEventListener("pointercancel", onPointerEnd);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
    },
    beginStep: beginInputStep,
    endStep: endInputStep,
  };
}
