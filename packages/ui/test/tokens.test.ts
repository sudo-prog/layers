import { describe, it, expect } from "vitest";
import {
  colorTokens,
  spacingTokens,
  typographyTokens,
  motionTokens,
  generateCSSVariables,
  contrastRatio,
  meetsWCAG_AA,
} from "../src/tokens.js";

describe("Design tokens", () => {
  it("has color tokens", () => {
    expect(colorTokens.length).toBeGreaterThan(0);
  });

  it("has spacing tokens", () => {
    expect(spacingTokens.length).toBeGreaterThan(0);
  });

  it("has typography tokens", () => {
    expect(typographyTokens.length).toBeGreaterThan(0);
  });

  it("has motion tokens", () => {
    expect(motionTokens.length).toBeGreaterThan(0);
  });
});

describe("CSS variable generation", () => {
  it("generates light theme", () => {
    const css = generateCSSVariables("light");
    expect(css).toContain(":root {");
    expect(css).toContain("--bg-primary: #ffffff");
  });

  it("generates dark theme", () => {
    const css = generateCSSVariables("dark");
    expect(css).toContain(":root {");
    expect(css).toContain("--bg-primary: #0a0a0a");
  });
});

describe("Contrast checking", () => {
  it("calculates contrast ratio", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("meets WCAG AA for normal text", () => {
    expect(meetsWCAG_AA("#000000", "#ffffff")).toBe(true);
  });

  it("fails WCAG AA for low contrast", () => {
    expect(meetsWCAG_AA("#888888", "#999999")).toBe(false);
  });
});
