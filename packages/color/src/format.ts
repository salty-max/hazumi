import { type Oklch, toSrgb } from "./oklch";

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** A 0-1 component as a two-digit hex byte. */
function hexByte(value: number): string {
  return Math.round(value * 255)
    .toString(16)
    .padStart(2, "0");
}

/** `oklch(...)`, preserving the colour exactly. */
export function toCss(color: Oklch): string {
  const l = round(color.l, 4);
  const c = round(color.c, 4);
  const h = round(color.h, 2);
  return color.alpha >= 1
    ? `oklch(${l} ${c} ${h})`
    : `oklch(${l} ${c} ${h} / ${round(color.alpha, 4)})`;
}

/** Gamut-mapped hex. Emits 8 digits only when the colour is translucent. */
export function toHex(color: Oklch): string {
  const srgb = toSrgb(color);
  const base = `#${hexByte(srgb.r)}${hexByte(srgb.g)}${hexByte(srgb.b)}`;
  return srgb.alpha >= 1 ? base : `${base}${hexByte(srgb.alpha)}`;
}

/** A 0-1 component as a 0-255 integer. */
function byte255(value: number): number {
  return Math.round(value * 255);
}

/** Gamut-mapped `rgb()`. */
export function toRgbCss(color: Oklch): string {
  const srgb = toSrgb(color);
  const rgb = `${byte255(srgb.r)} ${byte255(srgb.g)} ${byte255(srgb.b)}`;
  return srgb.alpha >= 1 ? `rgb(${rgb})` : `rgb(${rgb} / ${round(srgb.alpha, 4)})`;
}
