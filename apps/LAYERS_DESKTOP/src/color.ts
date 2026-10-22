/** Colour helpers shared by the editor and the props panel. */

/** Parse `#rgb` / `#rrggbb` (with or without `#`) to a 0–255 triple. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6 && /^[0-9a-fA-F]{6}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * Coerce any stored colour into a 0–255 triple.
 *
 * Accepts a hex string, or an array of numbers. Returns null when the value is
 * unusable, so the caller can fall back rather than pushing `NaN` into a shader.
 */
export function toRgbArray(value: unknown): [number, number, number] | null {
  if (typeof value === "string") return hexToRgb(value);
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value;
    if ([r, g, b].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return [r, g, b];
    }
  }
  return null;
}

/** Normalise any stored colour to `#rrggbb` for `<input type="color">`. */
export function toHexColor(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  const rgb = toRgbArray(value) ?? toRgbArray(fallback);
  if (!rgb) return "#000000";
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

/** Clamp to a range. */
export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}
