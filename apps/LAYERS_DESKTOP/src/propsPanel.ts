/**
 * The Props panel — the right column.
 *
 * Renders the selected layer's core params. Every numeric prop gets a slider
 * with a stepper and a tabular readout; selects and colours are native controls
 * so they stay keyboard-accessible and get the OS picker for free.
 *
 * A prop row is 32px. The label column is sized to the longest label in the
 * panel rather than a fixed 84px, because a fixed column narrower than the
 * longest label ellipsises it (that was a real bug in the mobile build).
 */

import type { StackItem } from "@layers/stack";
import { coreDef, type CoreDef, type ParamDef } from "./cores.js";
import { toHexColor, clamp } from "./color.js";
import { iconSvg } from "./icons.js";

export interface PanelHandlers {
  setParam: (id: string, key: string, value: unknown) => void;
  moveItem: (id: string, dir: "up" | "down") => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
}

/** Render the whole panel for the selected item. */
export function renderInspector(
  host: HTMLElement,
  items: StackItem[],
  selectedId: string | null,
  h: PanelHandlers,
): void {
  host.innerHTML = "";

  const item = items.find((i) => i.id === selectedId) ?? null;
  if (!item) {
    const empty = document.createElement("p");
    empty.className = "tree-empty";
    empty.textContent = items.length
      ? "Select a layer to edit its properties."
      : "No layers yet. Add a component from the toolbar below the canvas.";
    host.appendChild(empty);
    return;
  }

  const def = coreDef(item.core);
  if (!def) {
    const miss = document.createElement("p");
    miss.className = "tree-empty";
    miss.textContent = `Unknown core "${item.core}".`;
    host.appendChild(miss);
    return;
  }

  host.appendChild(header(def, item, h));
  host.appendChild(section("Transform", transformBody(item, h)));
  host.appendChild(section("Appearance", appearanceBody(item, h)));

  const paramsBody = document.createElement("div");
  paramsBody.className = "section-body";
  for (const p of def.params) paramsBody.appendChild(paramRow(item, p, h));
  host.appendChild(section(def.label, paramsBody));
}

function header(def: CoreDef, item: StackItem, h: PanelHandlers): HTMLElement {
  const el = document.createElement("div");
  el.className = "insp-head";

  const title = document.createElement("div");
  title.className = "insp-title";
  title.innerHTML = `<span class="insp-icon">${iconSvg(def.category)}</span><span>${def.label}</span>`;
  el.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "insp-actions";
  actions.appendChild(iconButton("chevronUp", "Move layer up", () => h.moveItem(item.id, "up")));
  actions.appendChild(iconButton("chevronDown", "Move layer down", () => h.moveItem(item.id, "down")));
  actions.appendChild(
    iconButton(item.enabled ? "eye" : "eyeOff", item.enabled ? "Hide layer" : "Show layer", () =>
      h.toggleItem(item.id),
    ),
  );
  actions.appendChild(iconButton("trash", "Delete layer", () => h.removeItem(item.id)));
  el.appendChild(actions);

  return el;
}

function transformBody(item: StackItem, h: PanelHandlers): HTMLElement {
  const body = document.createElement("div");
  body.className = "section-body";
  body.appendChild(
    sliderRow(
      "Opacity",
      Number(item.opacity ?? 1),
      0,
      1,
      0.01,
      (v) => h.setParam(item.id, "__opacity", v),
      { format: (v) => `${Math.round(v * 100)}%` },
    ),
  );
  return body;
}

function appearanceBody(item: StackItem, h: PanelHandlers): HTMLElement {
  const body = document.createElement("div");
  body.className = "section-body";

  const wrap = document.createElement("div");
  wrap.className = "ctl";
  const lab = document.createElement("label");
  lab.className = "ctl-label";
  lab.textContent = "Blend Mode";
  wrap.appendChild(lab);

  const sel = document.createElement("select");
  sel.className = "ctl-select";
  sel.setAttribute("aria-label", "Blend Mode");
  for (const b of ["normal", "multiply", "screen", "overlay", "difference"]) {
    const o = document.createElement("option");
    o.value = b;
    o.textContent = b.charAt(0).toUpperCase() + b.slice(1);
    if (b === item.blend) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => h.setParam(item.id, "__blend", sel.value));
  wrap.appendChild(sel);
  body.appendChild(wrap);

  return body;
}

function paramRow(item: StackItem, p: ParamDef, h: PanelHandlers): HTMLElement {
  const value = item.params[p.key] ?? p.default;

  if (p.type === "slider") {
    return sliderRow(
      p.label,
      Number(value),
      p.min ?? 0,
      p.max ?? 1,
      p.step ?? 0.01,
      (v) => h.setParam(item.id, p.key, v),
    );
  }

  if (p.type === "select") {
    const wrap = document.createElement("div");
    wrap.className = "ctl";
    const lab = document.createElement("label");
    lab.className = "ctl-label";
    lab.textContent = p.label;
    wrap.appendChild(lab);

    const sel = document.createElement("select");
    sel.className = "ctl-select";
    sel.setAttribute("aria-label", p.label);
    for (const o of p.options ?? []) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => h.setParam(item.id, p.key, sel.value));
    wrap.appendChild(sel);
    return wrap;
  }

  if (p.type === "toggle") {
    const wrap = document.createElement("div");
    wrap.className = "ctl";
    const lab = document.createElement("label");
    lab.className = "ctl-label";
    lab.textContent = p.label;
    lab.id = `lab-${item.id}-${p.key}`;
    wrap.appendChild(lab);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctl-toggle" + (value ? " is-on" : "");
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", String(Boolean(value)));
    btn.setAttribute("aria-labelledby", lab.id);
    btn.innerHTML = `<span class="ctl-toggle-knob"></span>`;
    btn.addEventListener("click", () => h.setParam(item.id, p.key, !value));
    wrap.appendChild(btn);
    return wrap;
  }

  // colour
  const wrap = document.createElement("div");
  wrap.className = "ctl";
  const lab = document.createElement("label");
  lab.className = "ctl-label";
  lab.textContent = p.label;
  lab.id = `lab-${item.id}-${p.key}`;
  wrap.appendChild(lab);

  const input = document.createElement("input");
  input.type = "color";
  input.className = "ctl-color";
  input.value = toHexColor(value, p.default);
  input.setAttribute("aria-labelledby", lab.id);
  input.addEventListener("input", () => h.setParam(item.id, p.key, input.value));
  wrap.appendChild(input);

  const readout = document.createElement("span");
  readout.className = "ctl-value";
  readout.textContent = input.value.toUpperCase();
  input.addEventListener("input", () => (readout.textContent = input.value.toUpperCase()));
  wrap.appendChild(readout);

  return wrap;
}

function sliderRow(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
  opts: { format?: (v: number) => string } = {},
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "ctl";

  const lab = document.createElement("label");
  lab.className = "ctl-label";
  lab.textContent = label;
  lab.id = `lab-${Math.random().toString(36).slice(2, 8)}`;
  wrap.appendChild(lab);

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "ctl-step";
  minus.setAttribute("aria-label", `Decrease ${label}`);
  minus.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>`;
  wrap.appendChild(minus);

  const range = document.createElement("input");
  range.type = "range";
  range.className = "ctl-range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.setAttribute("aria-labelledby", lab.id);
  wrap.appendChild(range);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "ctl-step";
  plus.setAttribute("aria-label", `Increase ${label}`);
  plus.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  wrap.appendChild(plus);

  const readout = document.createElement("span");
  readout.className = "ctl-value";
  wrap.appendChild(readout);

  const fmt = opts.format ?? ((v: number) => (step < 1 ? String(Number(v.toFixed(3))) : String(Math.round(v))));
  const sync = (v: number) => {
    readout.textContent = fmt(v);
    range.value = String(v);
  };
  sync(value);

  range.addEventListener("input", () => {
    const v = Number(range.value);
    readout.textContent = fmt(v);
    onChange(v);
  });
  minus.addEventListener("click", () => {
    const v = clamp(Number(range.value) - step, min, max);
    sync(v);
    onChange(v);
  });
  plus.addEventListener("click", () => {
    const v = clamp(Number(range.value) + step, min, max);
    sync(v);
    onChange(v);
  });

  return wrap;
}

function section(title: string, body: HTMLElement): HTMLElement {
  const el = document.createElement("section");
  el.className = "prop-section";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "section-head";
  btn.setAttribute("aria-expanded", "true");
  btn.innerHTML = `<span class="section-chevron">${iconSvg("chevronDown", 12)}</span><span>${title}</span>`;
  btn.addEventListener("click", () => {
    const open = el.classList.toggle("is-open");
    el.classList.toggle("is-closed", !open);
    btn.setAttribute("aria-expanded", String(open));
  });
  el.appendChild(btn);
  el.appendChild(body);
  el.classList.add("is-open");
  return el;
}

function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = iconSvg(icon);
  b.addEventListener("click", onClick);
  return b;
}
