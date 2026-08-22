import type { HazumiContext } from "./context";

/** Thrown when a scene-scoped API is used outside a synchronous Hazumi lifecycle callback. */
export class NoActiveSceneError extends Error {
  constructor() {
    super(
      "This Hazumi API needs an active scene. Call it from update(), draw(), dispose(), or before the first await in a scene factory.",
    );
    this.name = "NoActiveSceneError";
  }
}

let activeContext: HazumiContext | undefined;

export function getActiveContext(): HazumiContext {
  if (activeContext === undefined) throw new NoActiveSceneError();
  return activeContext;
}

/** @internal Saves the previous context so nested applications restore it exactly. */
export function enterContext(context: HazumiContext): HazumiContext | undefined {
  const previous = activeContext;
  activeContext = context;
  return previous;
}

/** @internal */
export function restoreContext(previous: HazumiContext | undefined): void {
  activeContext = previous;
}
