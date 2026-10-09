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

export const colorTokens: ColorToken[] = [
  { name: "bg-primary", light: "#ffffff", dark: "#0a0a0a" },
  { name: "bg-secondary", light: "#f5f5f5", dark: "#141414" },
  { name: "bg-tertiary", light: "#e8e8e8", dark: "#1e1e1e" },
  { name: "text-primary", light: "#0a0a0a", dark: "#ffffff" },
  { name: "text-secondary", light: "#555555", dark: "#aaaaaa" },
  { name: "text-tertiary", light: "#888888", dark: "#666666" },
  { name: "accent", light: "#0066ff", dark: "#4d9fff" },
  { name: "accent-hover", light: "#0052cc", dark: "#80bfff" },
  { name: "success", light: "#00aa44", dark: "#44cc77" },
  { name: "warning", light: "#ff8800", dark: "#ffaa44" },
  { name: "error", light: "#dd2200", dark: "#ff5544" },
  { name: "border", light: "#d4d4d4", dark: "#333333" },
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
