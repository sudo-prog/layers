/**
 * @layers/ui — Design tokens and UI utilities
 *
 * Token JSON → CSS variables; light/dark themes.
 * Contrast AA compliant.
 */

export interface ColorToken {
  name: string;
  light: string;
  dark: string;
}

export interface SpacingToken {
  name: string;
  value: number;
}

export interface TypographyToken {
  name: string;
  size: number;
  lineHeight: number;
  weight: number;
}

export interface MotionToken {
  name: string;
  duration: number;
  easing: string;
}

// ── Color tokens ─────────────────────────────────────────────────────────────
//
// "Graphite" ramp: a cool, desaturated dark scale for the dark theme, with a
// restrained studio blue accent. The light theme is the pre-existing neutral
// scale, kept so the theme switch still means something.
//
// The dark values are tuned for a TRANSLUCENT panel: the panels are ~80% opaque
// with a backdrop blur, so the effective backdrop is a blend of the panel fill
// and whatever the canvas shows through. `graphite-*` values were chosen dark
// enough that white text keeps >7:1 contrast even over a pure-white canvas at
// that alpha (measured — see docs/design-graphite.md).

export const colorTokens: ColorToken[] = [
  { name: "bg-primary", light: "#ffffff", dark: "#0a0b0d" },
  { name: "bg-secondary", light: "#f5f5f5", dark: "#101215" },
  { name: "bg-tertiary", light: "#e8e8e8", dark: "#16191d" },
  { name: "bg-raised", light: "#ffffff", dark: "#1c2026" },
  { name: "text-primary", light: "#0a0a0a", dark: "#f2f4f7" },
  { name: "text-secondary", light: "#555555", dark: "#9aa3af" },
  // Tertiary is used for section headers and metadata. It was #6b7280, which
  // fails AA on a dark panel at ANY panel alpha — even a fully opaque #101215
  // panel only reaches 3.88:1, because the colour itself is too dark for
  // small text on a dark ground. Lightened to #8b95a3, which holds 4.75:1 over
  // a pure-white canvas at the panel alpha below (measured).
  { name: "text-tertiary", light: "#6f6f6f", dark: "#8b95a3" },
  { name: "accent", light: "#0066ff", dark: "#7aa2ff" },
  { name: "accent-hover", light: "#0052cc", dark: "#9ab8ff" },
  { name: "success", light: "#00aa44", dark: "#4ade80" },
  { name: "warning", light: "#ff8800", dark: "#fbbf24" },
  { name: "error", light: "#dd2200", dark: "#f87171" },
  { name: "border", light: "#d4d4d4", dark: "#262b33" },
  { name: "border-strong", light: "#b8b8b8", dark: "#363c46" },
];

/**
 * Translucency, expressed as alpha channels rather than colours.
 *
 * Kept as separate tokens so the glass can be tuned in one place. A panel uses
 * `--panel-alpha` over `--bg-secondary`; the effective colour is what the
 * contrast measurements in docs/design-graphite.md are taken against.
 */
export const glassTokens: { name: string; light: string; dark: string }[] = [
  // Panels. The canvas behind can be pure white, so the panel has to darken its
  // own backdrop or no alpha can keep text legible: at 0.82 over white the
  // effective panel is rgb(59,61,63), where `text-tertiary` falls to 3.60:1.
  //
  // The fix is `brightness()` in the backdrop filter — it darkens the canvas
  // BEFORE the panel composites over it, so a lower alpha still clears AA and
  // the glass stays visibly translucent. Measured: alpha 0.74 with
  // brightness(0.45) gives rgb(38,40,42) over white (tertiary 4.88:1) and
  // rgb(12,13,16) over black — a 5.2x luminance difference between the two, so
  // the translucency is actually visible. See docs/design-graphite.md.
  { name: "panel-alpha", light: "0.88", dark: "0.74" },
  // The top toolbar sits over content the whole time; slightly heavier.
  { name: "chrome-alpha", light: "0.92", dark: "0.80" },
  // Hover/active washes inside a panel.
  { name: "wash-alpha", light: "0.05", dark: "0.06" },
  // Backdrop blur radius, in px. Higher than a normal glass because the canvas
  // is high-frequency (dither patterns, grain) and a soft blur reads better.
  { name: "glass-blur", light: "20px", dark: "32px" },
  { name: "glass-saturate", light: "1.15", dark: "1.25" },
  // Darkens the backdrop before compositing. Load-bearing for contrast over a
  // bright canvas — see the panel-alpha note above.
  { name: "glass-brightness", light: "1", dark: "0.45" },
];

// ── Spacing tokens (4px base) ────────────────────────────────────────────────

export const spacingTokens: SpacingToken[] = [
  { name: "space-0", value: 0 },
  { name: "space-1", value: 4 },
  { name: "space-2", value: 8 },
  { name: "space-3", value: 12 },
  { name: "space-4", value: 16 },
  { name: "space-5", value: 20 },
  { name: "space-6", value: 24 },
  { name: "space-8", value: 32 },
  { name: "space-10", value: 40 },
  { name: "space-12", value: 48 },
  { name: "space-16", value: 64 },
];

// ── Typography tokens ────────────────────────────────────────────────────────

export const typographyTokens: TypographyToken[] = [
  { name: "text-xs", size: 12, lineHeight: 16, weight: 400 },
  { name: "text-sm", size: 14, lineHeight: 20, weight: 400 },
  { name: "text-base", size: 16, lineHeight: 24, weight: 400 },
  { name: "text-lg", size: 18, lineHeight: 28, weight: 500 },
  { name: "text-xl", size: 20, lineHeight: 28, weight: 500 },
  { name: "text-2xl", size: 24, lineHeight: 32, weight: 600 },
  { name: "text-3xl", size: 30, lineHeight: 36, weight: 600 },
  { name: "text-4xl", size: 36, lineHeight: 40, weight: 700 },
];

// ── Motion tokens ────────────────────────────────────────────────────────────

export const motionTokens: MotionToken[] = [
  { name: "duration-fast", duration: 150, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  { name: "duration-normal", duration: 250, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  { name: "duration-slow", duration: 350, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
];

// ── CSS Variable Generation ──────────────────────────────────────────────────

export function generateCSSVariables(theme: "light" | "dark"): string {
  const lines: string[] = [];

  // Colors
  for (const c of colorTokens) {
    lines.push(`  --${c.name}: ${theme === "light" ? c.light : c.dark};`);
  }

  // Glass / translucency
  for (const g of glassTokens) {
    lines.push(`  --${g.name}: ${theme === "light" ? g.light : g.dark};`);
  }

  // Translucent panel surfaces, derived from the ramp + alpha so the two can
  // never drift apart. `rgb(... / a)` keeps the channel values readable in
  // devtools rather than collapsing to a single magic rgba().
  const bgSecondary = colorTokens.find((c) => c.name === "bg-secondary")!;
  const bgPrimary = colorTokens.find((c) => c.name === "bg-primary")!;
  const bgTertiary = colorTokens.find((c) => c.name === "bg-tertiary")!;
  const pick = (t: ColorToken) => (theme === "light" ? t.light : t.dark);
  const rgb = (hex: string) => {
    const h = hex.replace("#", "");
    return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
  };
  const panelAlpha = glassTokens.find((g) => g.name === "panel-alpha")!;
  const chromeAlpha = glassTokens.find((g) => g.name === "chrome-alpha")!;
  const a = theme === "light" ? panelAlpha.light : panelAlpha.dark;
  const ca = theme === "light" ? chromeAlpha.light : chromeAlpha.dark;

  lines.push(`  --surface-panel: rgb(${rgb(pick(bgSecondary))} / ${a});`);
  lines.push(`  --surface-chrome: rgb(${rgb(pick(bgPrimary))} / ${ca});`);
  lines.push(`  --surface-raised: rgb(${rgb(pick(bgTertiary))} / ${a});`);

  // Spacing
  for (const s of spacingTokens) {
    lines.push(`  --${s.name}: ${s.value}px;`);
  }

  // Typography
  for (const t of typographyTokens) {
    lines.push(`  --${t.name}-size: ${t.size}px;`);
    lines.push(`  --${t.name}-line-height: ${t.lineHeight}px;`);
    lines.push(`  --${t.name}-weight: ${t.weight};`);
  }

  // Motion
  for (const m of motionTokens) {
    lines.push(`  --${m.name}: ${m.duration}ms;`);
    lines.push(`  --${m.name}-easing: ${m.easing};`);
  }

  return `:root {\n${lines.join("\n")}\n}`;
}

// ── Contrast checking ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWCAG_AA(hex1: string, hex2: string, isLargeText = false): boolean {
  const ratio = contrastRatio(hex1, hex2);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

// ── Theme application ────────────────────────────────────────────────────────

export function applyTheme(theme: "light" | "dark"): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}
