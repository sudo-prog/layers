/**
 * LAYERS — Properties panel.
 *
 * The right-hand inspector, rebuilt to the same information architecture as the
 * Shaders design editor, with everything this app needs on top:
 *
 *   Transform  ·  Sizing  ·  Appearance  ·  <component props>  ·  Layer
 *
 * Every prop row carries a "make value dynamic" affordance so a static value
 * can be bound to a driver (cursor, time, or another layer) without leaving
 * the panel.
 *
 * ── Why this file is written as a store + render pass ──────────────────────
 * An earlier version captured `selected` and each param value in closures
 * inside the control factories. That is not viable here: writing a param
 * replaces the stack item, so every closure went stale and the panel silently
 * discarded changes made through another control. This version keeps the
 * selection in one module-level store and reads from it at render time, so
 * there is exactly one source of truth and no stale reads.
 *
 * `setParam` deliberately does NOT re-render the panel — rebuilding it would
 * destroy the dynamic editor the user has open. Instead each open editor
 * re-renders its own subtree from the store when a write lands.
 */

import {
  slider,
  numberField,
  colorField,
  segmented,
  select,
  toggle,
  section,
  sectionNote,
  type Control,
} from "./controls";
import { iconSvg } from "./icons";
import type { StackItem } from "@layers/stack";
import type { CoreDef } from "./main";

/* ── Store ──────────────────────────────────────────────────────────────── */

interface PanelStore {
  item: StackItem;
  def: CoreDef;
  all: StackItem[];
}

let store: PanelStore | null = null;

/** Open dynamic editors, keyed by the param row they belong to. */
const editors = new Map<string, () => void>();

function bump(): void {
  editors.forEach((fn) => fn());
}

/* ── Blend modes ──────────────────────────────────────────────────────────
   Mirrors the reference editor's list, including the two colour-space-qualified
   "Normal" entries, because they are genuinely different blend results. */
export const BLEND_MODES = [
  "normal",
  "normal-oklch",
  "normal-oklab",
  "multiply",
  "screen",
  "linear-dodge",
  "linear-burn",
  "color-dodge",
  "color-burn",
  "overlay",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "darken",
  "lighten",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

export function blendLabel(v: string): string {
  if (v === "normal-oklch") return "Normal (OKLCh)";
  if (v === "normal-oklab") return "Normal (OKLAB)";
  return v
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const MASK_CHANNELS = ["alpha", "luminance", "red", "green", "blue"];
const OBJECT_FITS = ["fill", "cover", "contain", "scale-down"];
export const COLOR_SPACES = ["srgb", "linear-rgb", "oklab", "oklch", "hsl", "hsv", "lab", "lch", "p3"];
export const TONE_MAPPINGS = ["linear", "aces-filmic", "neutral", "agx", "reinhard"];

/* ── Dynamic-prop driver ────────────────────────────────────────────────── */

export type DynamicMode = "off" | "cursor" | "auto" | "map";

export interface DynamicState {
  mode: DynamicMode;
  /** The plain value this prop falls back to when the driver is off. */
  base: number;
  axis: "x" | "y";
  min: number;
  max: number;
  curve: number;
  smoothing: number;
  momentum: number;
  speed: number;
  easing: string;
  reach: number;
  source: string;
  channel: string;
  lockX: boolean;
  lockY: boolean;
  invertX: boolean;
  invertY: boolean;
}

export function emptyDynamic(): DynamicState {
  return {
    mode: "off",
    base: 0,
    axis: "x",
    min: 0,
    max: 100,
    curve: 0,
    smoothing: 0.1,
    momentum: 0,
    speed: 1,
    easing: "sine",
    reach: 1,
    source: "",
    channel: "alpha",
    lockX: false,
    lockY: false,
    invertX: false,
    invertY: false,
  };
}

/**
 * A param is "dynamic" when its stored value carries our `dynamic: true`
 * marker. The stored value is the whole truth: the static fallback lives inside
 * it as `base`, so a dynamic prop and its plain value are never two copies that
 * can drift apart.
 */
export function readDynamic(value: unknown): DynamicState | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.dynamic !== true) return null;
  return {
    ...emptyDynamic(),
    ...o,
    // The stored range lives under outputMin/outputMax (the export contract);
    // the editor reads min/max.
    min: typeof o.outputMin === "number" ? o.outputMin : (o.min as number) ?? 0,
    max: typeof o.outputMax === "number" ? o.outputMax : (o.max as number) ?? 100,
    mode: (o.type === "auto-animate" ? "auto" : o.type === "mouse-position" ? "cursor" : o.type === "map" ? "map" : "off") as DynamicMode,
  };
}

export function isDynamic(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && (value as Record<string, unknown>).dynamic === true,
  );
}

/** Expands a dynamic state into the object the reference editor's Export writes. */
export function expandDynamic(state: DynamicState): Record<string, unknown> {
  if (state.mode === "auto") {
    return {
      dynamic: true,
      type: "auto-animate",
      mode: "ping-pong",
      outputMin: state.min,
      outputMax: state.max,
      speed: state.speed,
      easing: state.easing,
    };
  }
  if (state.mode === "cursor") {
    return {
      dynamic: true,
      type: "mouse-position",
      axis: state.axis,
      outputMin: state.min,
      outputMax: state.max,
      curve: state.curve,
      smoothing: state.smoothing,
      momentum: state.momentum,
      reach: state.reach,
      lockX: state.lockX,
      lockY: state.lockY,
      invertX: state.invertX,
      invertY: state.invertY,
    };
  }
  return {
    dynamic: true,
    type: "map",
    source: state.source,
    channel: state.channel,
    outputMin: state.min,
    outputMax: state.max,
    smoothing: state.smoothing,
  };
}

/**
 * Merges a new dynamic state into an existing stored value object.
 *
 * `expandDynamic` is spread FIRST and the previous object second, so any key the
 * previous value carried but the new state does not set (notably `dynamic`) is
 * preserved rather than silently dropped. Losing that marker made a committed
 * dynamic prop read back as a plain number.
 */
function withDynamic(prev: unknown, next: DynamicState): Record<string, unknown> {
  const base = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
  return { ...expandDynamic(next), ...base, dynamic: true };
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

export interface PropHandlers {
  setParam: (key: string, value: unknown) => void;
  setItem: (patch: Record<string, unknown>) => void;
  editMask: () => void;
  allItems: () => StackItem[];
  /** Rebuild the panel — used for structural changes only. */
  refresh: () => void;
}

export function buildPropsPanel(
  host: HTMLElement,
  selected: StackItem,
  def: CoreDef,
  handlers: PropHandlers,
): void {
  editors.clear();
  store = { item: selected, def, all: handlers.allItems() };

  /** Re-read the live item from the app store; our copy goes stale on write. */
  const live = (): StackItem => {
    const fresh = handlers.allItems().find((i) => i.id === store!.item.id);
    if (fresh) store!.item = fresh;
    return store!.item;
  };
  const params = () => live().params;

  /**
   * Writes a param and refreshes the open editors. The panel itself is NOT
   * rebuilt — that would destroy the dynamic editor the user has open.
   */
  const commitParam = (key: string, value: unknown) => {
    handlers.setParam(key, value);
    live();
    bump();
  };
  const commitItem = (patch: Record<string, unknown>) => {
    handlers.setItem(patch);
    handlers.refresh();
  };

  host.innerHTML = "";

  /* Header */
  const head = document.createElement("div");
  head.className = "props-head";
  head.innerHTML = `
    <div class="props-head-title">
      <span class="props-head-icon">${iconSvg(def.iconName)}</span>
      <span class="props-head-name">${def.label}</span>
    </div>
    <button type="button" class="icon-btn" data-props-docs title="Component documentation" aria-label="Component documentation">
      ${iconSvg("doc")}
    </button>`;
  host.appendChild(head);

  /* ── Transform ─────────────────────────────────────────────────────── */
  const s = section({ title: "Transform", icon: "move", open: true });
  s.body.appendChild(
    twoUp(
      unitSlider("X", Number(params().offsetX ?? 0), -100, 100, 1, "%"),
      unitSlider("Y", Number(params().offsetY ?? 0), -100, 100, 1, "%"),
      (v) => commitParam("offsetX", v),
      (v) => commitParam("offsetY", v),
    ),
  );
  s.body.appendChild(
    twoUp(
      unitSlider("Rotation", Number(params().rotation ?? 0), 0, 360, 1, "°"),
      slider({ label: "Opacity", min: 0, max: 1, step: 0.01, value: live().opacity }),
      (v) => commitParam("rotation", v),
      (v) => commitItem({ opacity: Number(v) }),
    ),
  );
  host.appendChild(s.el);

  /* ── Sizing ────────────────────────────────────────────────────────── */
  const sz = section({ title: "Sizing", icon: "frame", open: true });
  const fit = segmented({
    label: "Object Fit",
    value: String(params().objectFit ?? "cover"),
    options: OBJECT_FITS.map((f) => ({ value: f, label: f, title: `Object fit: ${f}` })),
    // `scale-down` is the widest option: 61px of text + 8px of padding. Without
    // this the 4-option row needs 184px and gets 153px, so `contain` lost 12px
    // and `scale-down` 34px to ellipsis. The control stacks below 380px of panel.
    minPerOption: 69,
  });
  fit.onChange((v) => commitParam("objectFit", v));
  sz.body.appendChild(fit.el);

  sz.body.appendChild(
    twoUp(
      unitSlider("Width", Number(params().width ?? 100), 0, 400, 1, "%"),
      unitSlider("Height", Number(params().height ?? 100), 0, 400, 1, "%"),
      (v) => commitParam("width", v),
      (v) => commitParam("height", v),
    ),
  );
  host.appendChild(sz.el);

  /* ── Appearance ────────────────────────────────────────────────────── */
  const ap = section({ title: "Appearance", icon: "blend", open: true });

  const opacity = slider({
    label: "Opacity",
    min: 0,
    max: 1,
    step: 0.01,
    value: live().opacity,
    format: (v) => `${Math.round(v * 100)}`,
  });
  opacity.onChange((v) => commitItem({ opacity: Number(v) }));
  ap.body.appendChild(opacity.el);

  const blend = select({
    label: "Blend Mode",
    value: live().blend,
    options: BLEND_MODES.map((m) => ({ value: m, label: blendLabel(m) })),
    wide: true,
  });
  blend.onChange((v) => commitItem({ blend: String(v) }));
  ap.body.appendChild(blend.el);

  const maskSource = select({
    label: "Mask Source",
    value: String(params().maskSource ?? "none"),
    options: [
      { value: "none", label: "None" },
      ...store.all
        .filter((i) => i.id !== live().id)
        .map((i) => ({ value: i.id, label: layerName(i, store!.all) })),
    ],
    wide: true,
  });
  maskSource.onChange((v) => commitParam("maskSource", v === "none" ? null : String(v)));
  ap.body.appendChild(maskSource.el);

  const maskChannel = select({
    label: "Mask Channel",
    value: String(params().maskChannel ?? "alpha"),
    options: MASK_CHANNELS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
  });
  maskChannel.onChange((v) => commitParam("maskChannel", String(v)));
  ap.body.appendChild(maskChannel.el);

  const maskBtn = document.createElement("button");
  maskBtn.type = "button";
  maskBtn.className = "btn btn-block";
  maskBtn.innerHTML = `${iconSvg("mask")}<span>Edit Mask</span>`;
  maskBtn.addEventListener("click", () => handlers.editMask());
  ap.body.appendChild(maskBtn);

  host.appendChild(ap.el);

  /* ── Component props ───────────────────────────────────────────────── */
  if (def.params.length) {
    const own = section({ title: def.label, icon: "cores", open: true });
    own.body.appendChild(sectionNote(def.blurb));
    for (const param of def.params) own.body.appendChild(paramControl(param, commitParam, commitItem));
    host.appendChild(own.el);
  }

  /* ── Layer actions ─────────────────────────────────────────────────── */
  const act = section({ title: "Layer", icon: "layers", open: false });

  const row = document.createElement("div");
  row.className = "btn-row";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "btn";
  up.innerHTML = `${iconSvg("plus")}<span>Move Up</span>`;
  up.addEventListener("click", () => commitItem({ __move: "up" }));
  const down = document.createElement("button");
  down.type = "button";
  down.className = "btn";
  down.innerHTML = `${iconSvg("minus")}<span>Move Down</span>`;
  down.addEventListener("click", () => commitItem({ __move: "down" }));
  row.append(up, down);
  act.body.appendChild(row);

  const vis = toggle({ label: "Visible", value: live().enabled });
  vis.onChange((v) => commitItem({ enabled: Boolean(v) }));
  act.body.appendChild(vis.el);

  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "btn btn-block btn-danger";
  rm.innerHTML = `${iconSvg("close")}<span>Remove Layer</span>`;
  rm.addEventListener("click", () => commitItem({ __remove: true }));
  act.body.appendChild(rm);

  host.appendChild(act.el);
}

/** Human name for a layer — its core, disambiguated by position. */
export function layerName(item: StackItem, all: StackItem[]): string {
  const idx = all.findIndex((i) => i.id === item.id);
  return `${item.core} ${idx + 1}`;
}

/** Two controls sharing one row. */
function twoUp(a: Control, b: Control, bindA: (v: unknown) => void, bindB: (v: unknown) => void): HTMLElement {
  a.onChange(bindA);
  b.onChange(bindB);
  const g = document.createElement("div");
  g.className = "ctl-grid";
  g.append(a.el, b.el);
  return g;
}

/** Slider that can flip between % and px, matching the reference editor. */
function unitSlider(label: string, value: number, min: number, max: number, step: number, unit: string): Control {
  return slider({
    label,
    min,
    max,
    step,
    value,
    unit: unit === "°" ? undefined : (unit as "%" | "px"),
    steppers: true,
    format: (v) => String(Math.round(v * 10) / 10),
  });
}

/* ── Per-param control + dynamic-prop affordance ────────────────────────── */

function paramControl(
  param: CoreDef["params"][number],
  commitParam: (key: string, value: unknown) => void,
  commitItem: (patch: Record<string, unknown>) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "param";
  wrap.dataset.param = param.key;

  const body = document.createElement("div");
  body.className = "param-body";
  wrap.appendChild(body);

  /** Always read through the store — never a captured value. */
  const value = () => store!.item.params[param.key] ?? param.default;
  const dyn = () => readDynamic(value());

  /* Only numeric props can be driven by a dynamic value — a colour, a select
     or a toggle has no meaningful numeric range to animate. The affordance is
     hidden for those rather than offered and then silently corrupting the
     stored value (an object where the dropdown needs a string). */
  const drivable = param.type === "slider";

  let control: Control;

  if (param.type === "slider") {
    control = slider({
      label: param.label,
      min: param.min ?? 0,
      max: param.max ?? 100,
      step: param.step ?? 1,
      value: Number(value()),
      steppers: true,
    });
    control.onChange((v) => {
      const n = Number(v);
      const d = dyn();
      // A driven prop keeps the driver config and updates its base value; a
      // static one is just a number.
      commitParam(
        param.key,
        d ? withDynamic({ ...(value() as Record<string, unknown>), base: n }, d) : n,
      );
    });
  } else if (param.type === "color") {
    control = colorField({
      label: param.label,
      value: typeof value() === "string" ? (value() as string) : "#000000",
      showHex: true,
    });
    control.onChange((v) => commitParam(param.key, String(v)));
  } else if (param.type === "select") {
    control = select({
      label: param.label,
      value: String(value()),
      options: param.options ?? [],
      wide: true,
    });
    control.onChange((v) => commitParam(param.key, String(v)));
  } else if (param.type === "toggle") {
    control = toggle({ label: param.label, value: Boolean(value()) });
    control.onChange((v) => commitParam(param.key, Boolean(v)));
  } else {
    control = numberField({ label: param.label, value: Number(value()), step: param.step ?? 1 });
    control.onChange((v) => commitParam(param.key, Number(v)));
  }

  body.appendChild(control.el);

  if (!drivable) return wrap;

  /* The affordance: turns any static prop into a drivable one. */
  const dynBtn = document.createElement("button");
  dynBtn.type = "button";
  dynBtn.className = "icon-btn dyn-btn";
  // A visually-hidden text node, not just an aria-label: an icon-only button
  // whose SVG is `aria-hidden` is exposed to the accessibility tree as an
  // unnamed node, which makes it impossible to target by name in a test.
  // Compact text + icon rather than icon-only: an icon-only button is dropped
  // from a truncated accessibility hierarchy, which makes it impossible to
  // target in a test — and leaves the control unexplained to a sighted user
  // too. The label is abbreviated because the row is already dense.
  dynBtn.innerHTML = `${iconSvg("dynamic")}<span class="dyn-btn-label"></span>`;
  body.appendChild(dynBtn);

  const syncAffordance = () => {
    const d = dyn();
    dynBtn.classList.toggle("is-active", Boolean(d));
    dynBtn.setAttribute("aria-pressed", String(Boolean(d)));
    dynBtn.title = d ? `Value is dynamic (${d.mode})` : "Make value dynamic";
    // Name the control after the param it drives. The icon inside is
    // `aria-hidden`, so without this the button has no accessible name and
    // cannot be targeted by an accessibility-tree assertion.
    dynBtn.setAttribute(
      "aria-label",
      d ? `Value of ${param.label} is dynamic, ${d.mode}. Activate to configure.` : `Make ${param.label} dynamic`,
    );
    // A visually-hidden text node keeps the control nameable by text, not just
    // by aria-label, and reflects the current state.
    //
    // The label shows the MODE when driven (`cursor`, `auto`, `map`) rather than
    // a constant `dyn`, so the button states what is driving the prop. That
    // needs a fixed width wide enough for the longest mode word — otherwise the
    // button grows and shrinks and the label ellipsises. Measured: `cursor` is
    // 37px of text + 8px padding + icon 13px + gap 4px + border 2px = 64px.
    const label = dynBtn.querySelector<HTMLElement>(".dyn-btn-label")!;
    label.textContent = d ? d.mode : "dyn";
    label.title = d
      ? `Value of ${param.label} is dynamic, ${d.mode}. Activate to configure.`
      : `Make ${param.label} dynamic`;
    if (d) control.write(d.base);
  };
  syncAffordance();

  /* ── Dynamic editor ──────────────────────────────────────────────────
     Rendered from the store each time, so the branch list always matches the
     stored driver. Registered in `editors` so a write from ANY control
     refreshes it — the host deliberately does not rebuild the panel. */
  let dynHost: HTMLElement | null = null;
  let isOpen = false;

  const renderEditor = () => {
    if (!dynHost) return;
    const d = dyn();
    const state = d ?? emptyDynamic();
    const base = d?.base ?? (Number(value()) || 0);

    const commit = (next: DynamicState) => {
      // Build the value from the state we are editing, not from a re-read of
      // the store — setParam replaces the item, so `value()` here is already
      // the freshly written value and merging it back would drop the change.
      const value =
        next.mode === "off"
          ? next.base
          : { ...expandDynamic(next), base: next.base };
      commitParam(param.key, value);
    };

    dynHost.innerHTML = "";

    const mode = segmented({
      label: "Driver",
      value: state.mode,
      options: [
        { value: "off", label: "Off" },
        { value: "cursor", label: "Cursor" },
        { value: "auto", label: "Auto" },
        { value: "map", label: "Map" },
      ],
    });
    mode.onChange((v) => commit({ ...state, mode: v as DynamicMode }));
    dynHost.appendChild(mode.el);

    if (state.mode === "off") {
      const note = document.createElement("p");
      note.className = "prop-note";
      note.textContent = "Static value. Pick a driver to bind this prop to time, the cursor, or another layer.";
      dynHost.appendChild(note);
      return;
    }

    if (state.mode === "cursor") {
      const axis = segmented({
        label: "Axis",
        value: state.axis,
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      });
      axis.onChange((v) => commit({ ...state, axis: v as "x" | "y" }));
      dynHost.appendChild(axis.el);
    }

    if (state.mode === "map") {
      const src = select({
        label: "Source",
        value: state.source || "none",
        options: [
          { value: "none", label: "None" },
          ...store!.all
            .filter((i) => i.id !== store!.item.id)
            .map((i) => ({ value: i.id, label: layerName(i, store!.all) })),
        ],
        wide: true,
      });
      src.onChange((v) => commit({ ...state, source: String(v) }));
      dynHost.appendChild(src.el);

      const ch = select({
        label: "Channel",
        value: state.channel,
        options: MASK_CHANNELS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
      });
      ch.onChange((v) => commit({ ...state, channel: String(v) }));
      dynHost.appendChild(ch.el);
    }

    if (state.mode === "auto") {
      const speed = slider({
        label: "Speed",
        min: 0,
        max: 4,
        step: 0.1,
        value: state.speed,
        format: (v) => String(Math.round(v * 10) / 10),
      });
      speed.onChange((v) => commit({ ...state, speed: Number(v) }));
      dynHost.appendChild(speed.el);

      const ease = select({
        label: "Easing",
        value: state.easing,
        options: ["sine", "linear", "quad", "expo", "bounce"].map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) })),
      });
      ease.onChange((v) => commit({ ...state, easing: String(v) }));
      dynHost.appendChild(ease.el);
    }

    if (state.mode !== "auto") {
      dynHost.appendChild(
        twoUp(
          slider({ label: "Min", min: -1000, max: 1000, step: 1, value: state.min, format: (v) => String(Math.round(v)) }),
          slider({ label: "Max", min: -1000, max: 1000, step: 1, value: state.max, format: (v) => String(Math.round(v)) }),
          (v) => commit({ ...state, min: Number(v) }),
          (v) => commit({ ...state, max: Number(v) }),
        ),
      );
    }

    dynHost.appendChild(
      twoUp(
        slider({ label: "Smoothing", min: 0, max: 1, step: 0.05, value: state.smoothing, format: (v) => String(Math.round(v * 100) / 100) }),
        slider({ label: "Momentum", min: 0, max: 1, step: 0.05, value: state.momentum, format: (v) => String(Math.round(v * 100) / 100) }),
        (v) => commit({ ...state, smoothing: Number(v) }),
        (v) => commit({ ...state, momentum: Number(v) }),
      ),
    );

    /* The static number this prop reverts to when the driver is switched off.
       NOTE: this label is LAYERS', not the reference editor's — the reference
       editor does not expose the fallback as an editable value. It exists here
       because a driven prop and its plain value must not become two copies
       that drift apart. */
    const baseSlider = slider({
      label: "Base value",
      min: param.min ?? -1000,
      max: param.max ?? 1000,
      step: param.step ?? 1,
      value: base,
      steppers: true,
      format: (v) => String(Math.round(v * 100) / 100),
    });
    baseSlider.onChange((v) => commit({ ...state, base: Number(v) }));
    dynHost.appendChild(baseSlider.el);

    if (state.mode === "cursor") {
      const curve = slider({ label: "Curve", min: -1, max: 1, step: 0.05, value: state.curve, format: (v) => String(Math.round(v * 100) / 100) });
      curve.onChange((v) => commit({ ...state, curve: Number(v) }));
      dynHost.appendChild(curve.el);

      const reach = slider({ label: "Reach", min: 0, max: 2, step: 0.05, value: state.reach, format: (v) => String(Math.round(v * 100) / 100) });
      reach.onChange((v) => commit({ ...state, reach: Number(v) }));
      dynHost.appendChild(reach.el);

      const adj = section({ title: "Adjustments", icon: "adjust", open: false });
      const mk = (label: string, key: "lockX" | "lockY" | "invertX" | "invertY") => {
        const t = toggle({ label, value: state[key] });
        t.onChange((v) => commit({ ...state, [key]: Boolean(v) }));
        return t.el;
      };
      adj.body.append(mk("Lock X", "lockX"), mk("Lock Y", "lockY"), mk("Invert Horizontal", "invertX"), mk("Invert Vertical", "invertY"));
      dynHost.appendChild(adj.el);
    }
  };

  dynBtn.addEventListener("click", () => {
    isOpen = !isOpen;
    wrap.classList.toggle("is-dyn-open", isOpen);
    if (isOpen) {
      if (!dynHost) {
        dynHost = document.createElement("div");
        dynHost.className = "dyn-editor";
        wrap.appendChild(dynHost);
      }
      renderEditor();
      editors.set(param.key, () => {
        syncAffordance();
        if (isOpen) renderEditor();
      });
    } else {
      editors.delete(param.key);
    }
  });

  return wrap;
}

/** Formats a stored param value for display without mutating it. */
export function describeValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.dynamic === true) return String(o.type ?? o.mode ?? "dynamic");
    return JSON.stringify(o);
  }
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  return String(v);
}

export function colorSpaceOptions(): { value: string; label: string }[] {
  return COLOR_SPACES.map((c) => ({ value: c, label: c.toUpperCase().replace("-", " ") }));
}

export function toneMappingOptions(): { value: string; label: string }[] {
  return TONE_MAPPINGS.map((t) => ({ value: t, label: t.replace("-", " ").replace(/\b\w/g, (m) => m.toUpperCase()) }));
}
