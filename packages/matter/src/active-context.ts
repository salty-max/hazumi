import type { MatterContext } from "./context";

/** Thrown when a scene-scoped API is used outside a synchronous Matter lifecycle callback. */
export class NoActiveSceneError extends Error {
  constructor() {
    super(
      "This Matter API needs an active scene. Call it from update(), draw(), dispose(), or before the first await in a scene factory.",
    );
    this.name = "NoActiveSceneError";
  }
}

let activeContext: MatterContext | undefined;

export function getActiveContext(): MatterContext {
  if (activeContext === undefined) throw new NoActiveSceneError();
  return activeContext;
}

/** @internal Saves the previous context so nested applications restore it exactly. */
export function enterContext(context: MatterContext): MatterContext | undefined {
  const previous = activeContext;
  activeContext = context;
  return previous;
}

/** @internal */
export function restoreContext(previous: MatterContext | undefined): void {
  activeContext = previous;
}
