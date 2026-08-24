import { afterEach, describe, expect, test } from "bun:test";
import { createInputTracking, type InputTracking } from "../src/input-tracking";
import type { ContextState } from "../src/context";

/**
 * Keys arrive at the window, so every sketch on a page used to hear every one
 * of them. These are the rules that decide which one is listening.
 */

class FakeCanvas extends EventTarget {
  tabIndex = 0;
  focus(): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
  }
}

function makeState(): ContextState {
  return {
    width: 100,
    height: 100,
    pixelRatio: 1,
    frameCount: 0,
    t: 0,
    dt: 0,
    mouseX: 0,
    mouseY: 0,
    pmouseX: 0,
    pmouseY: 0,
    mouseIsPressed: false,
    mouseButton: 0,
    keyIsPressed: false,
    key: "",
    keysDown: new Set<string>(),
    keysPressed: new Set<string>(),
    keysReleased: new Set<string>(),
    mouseButtonsPressed: new Set<number>(),
    mouseButtonsReleased: new Set<number>(),
    pointers: [],
    pointersPressed: new Set<number>(),
    pointersReleased: new Set<number>(),
    wheelX: 0,
    wheelY: 0,
    gamepads: [],
    gamepadButtonsPressed: new Map(),
    gamepadButtonsReleased: new Map(),
    looping: true,
  };
}

interface Sketch {
  readonly state: ContextState;
  readonly canvas: FakeCanvas;
  readonly tracking: InputTracking;
}

const originalDocument = globalThis.document;
const attached: InputTracking[] = [];

/** A document stub whose focus can be moved, which is the whole subject here. */
function focusOn(element: unknown): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: element, body: { tagName: "BODY" } },
  });
}

function sketch(): Sketch {
  const canvas = new FakeCanvas();
  const state = makeState();
  const tracking = createInputTracking(state, canvas as unknown as HTMLCanvasElement);
  tracking.attach();
  attached.push(tracking);
  return { state, canvas, tracking };
}

function press(key: string): void {
  const event = new Event("keydown");
  Object.defineProperty(event, "key", { value: key, configurable: true });
  globalThis.dispatchEvent(event);
}

function release(key: string): void {
  const event = new Event("keyup");
  Object.defineProperty(event, "key", { value: key, configurable: true });
  globalThis.dispatchEvent(event);
}

afterEach(() => {
  for (const tracking of attached.splice(0)) tracking.detach();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("who the keyboard belongs to", () => {
  test("a lone sketch answers without being clicked first", () => {
    focusOn(null);
    const only = sketch();
    press("a");
    only.tracking.beginStep();
    expect(only.state.keysDown.has("a")).toBe(true);
  });

  test("a lone sketch stays quiet while you are typing", () => {
    focusOn({ tagName: "INPUT" });
    const only = sketch();
    press("a");
    only.tracking.beginStep();
    expect(only.state.keysDown.has("a")).toBe(false);
  });

  test("two sketches wait to be clicked rather than both answering", () => {
    // The bug: the space bar that fired a shot also restarted the motorbike
    // two cards down the gallery.
    focusOn(null);
    const first = sketch();
    const second = sketch();
    press(" ");
    first.tracking.beginStep();
    second.tracking.beginStep();
    expect(first.state.keysDown.has(" ")).toBe(false);
    expect(second.state.keysDown.has(" ")).toBe(false);
  });

  test("the clicked one takes the keys, and only it", () => {
    focusOn(null);
    const first = sketch();
    const second = sketch();
    focusOn(second.canvas);
    press(" ");
    first.tracking.beginStep();
    second.tracking.beginStep();
    expect(second.state.keysDown.has(" ")).toBe(true);
    expect(first.state.keysDown.has(" ")).toBe(false);
  });

  test("the last sketch standing gets the keyboard back", () => {
    focusOn(null);
    const first = sketch();
    const second = sketch();
    second.tracking.detach();
    attached.splice(attached.indexOf(second.tracking), 1);
    press("a");
    first.tracking.beginStep();
    expect(first.state.keysDown.has("a")).toBe(true);
  });

  test("a release is taken even by a sketch the key never belonged to", () => {
    // Focus can move while a key is held. The keyup goes wherever focus went,
    // and a sketch that ignored it would hold that key down for good.
    focusOn(null);
    const only = sketch();
    press("ArrowLeft");
    only.tracking.beginStep();
    expect(only.state.keysDown.has("ArrowLeft")).toBe(true);

    focusOn({ tagName: "INPUT" });
    release("ArrowLeft");
    only.tracking.beginStep();
    expect(only.state.keysDown.has("ArrowLeft")).toBe(false);
  });
});
