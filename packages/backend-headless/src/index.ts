/**
 * L4 — records the command stream instead of rendering it, so tests assert on
 * what was drawn rather than pixel-diffing a browser screenshot.
 */

export interface RecordedCommand {
  readonly op: number;
  readonly args: readonly number[];
}

// TODO(P1): recording backend + assertion helpers.
