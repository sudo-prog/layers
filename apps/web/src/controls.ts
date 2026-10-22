/**
 * LAYERS — inspector control primitives.
 *
 * Pure-DOM builders for every control type the properties panel needs. Each
 * factory returns an element plus a `read()`/`write()` pair, so the inspector
 * can render a whole section declaratively and bind it in one pass.
 *
 * Deliberate choices:
 * - Inline SVG icons via `iconSvg()` from ./icons — never emoji. Emoji cannot
 *   inherit `currentColor` and render inconsistently across platforms.
 * - Every control carries a real `<label>` or an `aria-label`; nothing is
 *   icon-only without a name.
 * - Values that update live get `font-variant-numeric: tabular-nums` in CSS so
 *   digits don't shift the layout as they change.
 */

import { iconSvg } from "./icons";

export type Unit = "%" | "px";

/** A labelled control that can be read back out of the DOM. */
export interface Control {
  el: HTMLElement;
  /** Reads the control's current value. */
  read(): unknown;
  /** Writes a value without firing the change callback. */
  write(v: unknown): void;
  /** Called when the user changes the control. */
  onChange(fn: (v: unknown) => void): void;
  /** Disables/enables the control. */
  setDisabled(d: boolean): void;
}

function row(label: string, control: string, labelledBy?: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "ctl";
  const lab = document.createElement("label");
  lab.className = "ctl-label";
  lab.textContent = label;
  if (labelledBy) lab.setAttribute("id", labelledBy);
  wrap.appendChild(lab);
  const body = document.createElement("div");
  body.className = "ctl-body";
  body.innerHTML = control;
  wrap.appendChild(body);
  return wrap;
}

function inputEl(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/* ── Slider ─────────────────────────────────────────────────────────────── */

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: Unit;
  /** Small +/- steppers either side of the slider. */
  steppers?: boolean;
  format?: (v: number) => string;
}

export function slider(o: SliderOpts): Control {
  const fmt = o.format ?? ((v: number) => String(Math.round(v * 1000) / 1000));
  const id = `sl-${Math.random().toString(36).slice(2, 8)}`;
  const unitId = `${id}-unit`;

  const unitBtn = o.unit
    ? `<button type="button" class="ctl-unit" id="${unitId}" title="Switch unit" aria-label="Switch unit between percent and pixels">${o.unit}</button>`
    : "";

  const el = row(
    o.label,
    `<div class="ctl-slider">
       <button type="button" class="ctl-step" data-step="-1" aria-label="Decrease ${o.label}">${iconSvg("minus")}</button>
       <input type="range" id="${id}" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" aria-labelledby="${id}-lab">
       <button type="button" class="ctl-step" data-step="1" aria-label="Increase ${o.label}">${iconSvg("plus")}</button>
       <output class="ctl-value" id="${id}-val" for="${id}">${fmt(o.value)}</output>
       ${unitBtn}
     </div>`,
  );
  el.querySelector(".ctl-label")!.setAttribute("id", `${id}-lab`);

  const range = el.querySelector<HTMLInputElement>("input[type=range]")!;
  const out = el.querySelector<HTMLOutputElement>(".ctl-value")!;
  const unit = el.querySelector<HTMLButtonElement>(".ctl-unit");

  let fn: ((v: unknown) => void) | null = null;
  const fire = () => fn && fn(parseFloat(range.value));

  range.addEventListener("input", () => {
    out.textContent = fmt(parseFloat(range.value));
    fire();
  });

  el.querySelectorAll<HTMLButtonElement>(".ctl-step").forEach((b) => {
    b.addEventListener("click", () => {
      const dir = parseInt(b.dataset.step!, 10);
      const next = parseFloat(range.value) + dir * o.step;
      const clamped = Math.min(o.max, Math.max(o.min, next));
      range.value = String(clamped);
      out.textContent = fmt(clamped);
      fire();
    });
  });

  if (unit) {
    unit.addEventListener("click", () => {
      const next: Unit = unit.textContent === "%" ? "px" : "%";
      unit.textContent = next;
      unit.setAttribute("aria-label", `Unit is ${next}. Activate to switch.`);
      fn && fn({ value: parseFloat(range.value), unit: next });
    });
  }

  return {
    el,
    read: () => parseFloat(range.value),
    write: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      range.value = String(n);
      out.textContent = fmt(n);
    },
    onChange: (f) => (fn = f),
    setDisabled: (d) => {
      range.disabled = d;
      el.querySelectorAll("button").forEach((b) => (b.disabled = d));
    },
  };
}

/* ── Number field ───────────────────────────────────────────────────────── */

export interface NumberOpts {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: Unit;
  format?: (v: number) => string;
}

export function numberField(o: NumberOpts): Control {
  const fmt = o.format ?? ((v: number) => String(Math.round(v * 1000) / 1000));
  const id = `nf-${Math.random().toString(36).slice(2, 8)}`;
  const el = row(
    o.label,
    `<input type="number" class="ctl-input" id="${id}" value="${o.value}"
       step="${o.step ?? 1}"${o.min !== undefined ? ` min="${o.min}"` : ""}${o.max !== undefined ? ` max="${o.max}"` : ""}
       aria-label="${o.label}">`,
  );
  const inp = el.querySelector<HTMLInputElement>("input")!;
  let fn: ((v: unknown) => void) | null = null;
  inp.addEventListener("input", () => {
    const n = parseFloat(inp.value);
    if (Number.isFinite(n)) fn && fn(n);
  });
  return {
    el,
    read: () => parseFloat(inp.value),
    write: (v) => {
      inp.value = String(v);
    },
    onChange: (f) => (fn = f),
    setDisabled: (d) => (inp.disabled = d),
  };
}

/* ── Colour swatch ──────────────────────────────────────────────────────── */

export interface ColorOpts {
  label: string;
  value: string;
  /** Show the hex string next to the swatch. */
  showHex?: boolean;
}

export function colorField(o: ColorOpts): Control {
  const id = `cf-${Math.random().toString(36).slice(2, 8)}`;
  const el = row(
    o.label,
    `<div class="ctl-color">
       <label class="ctl-swatch" style="--swatch:${o.value}" title="${o.label}">
         <input type="color" id="${id}" value="${o.value}" aria-label="${o.label}">
       </label>
       ${o.showHex === false ? "" : `<output class="ctl-hex" id="${id}-hex">${o.value}</output>`}
     </div>`,
  );
  const inp = el.querySelector<HTMLInputElement>("input[type=color]")!;
  const hex = el.querySelector<HTMLOutputElement>(".ctl-hex");
  let fn: ((v: unknown) => void) | null = null;
  inp.addEventListener("input", () => {
    el.querySelector<HTMLElement>(".ctl-swatch")!.style.setProperty("--swatch", inp.value);
    if (hex) hex.textContent = inp.value;
    fn && fn(inp.value);
  });
  return {
    el,
    read: () => inp.value,
    write: (v) => {
      inp.value = String(v);
      el.querySelector<HTMLElement>(".ctl-swatch")!.style.setProperty("--swatch", inp.value);
      if (hex) hex.textContent = inp.value;
    },
    onChange: (f) => (fn = f),
    setDisabled: (d) => (inp.disabled = d),
  };
}

/* ── Segmented control ──────────────────────────────────────────────────── */

export interface SegmentedOpts {
  label: string;
  options: { value: string; label: string; icon?: string; title?: string }[];
  value: string;
  /**
   * Allow clicking the already-active option to clear the selection.
   * Off by default: a segmented control is a single-choice field, and letting a
   * plain click silently empty it makes the current value ambiguous.
   */
  allowEmpty?: boolean;
  /**
   * Natural width of the widest option label, in px, INCLUDING its padding.
   *
   * Set this and the control guarantees every option at least that width, so no
   * label ellipsises. Leave it unset for a 2-option control (X/Y, on/off) whose
   * labels are short enough to fit a shared track.
   *
   * Measured need for `Object Fit`: `scale-down` is 61px of text + 8px padding =
   * 69px, so 4 options need ~284px against a 153px track. The control therefore
   * switches to a stacked layout rather than trying to squeeze.
   */
  minPerOption?: number;
  /**
   * Stack the options vertically (one full-width row each). Applied
   * automatically by CSS when `minPerOption` makes the control too wide for the
   * panel, but can be forced.
   */
  stack?: boolean;
}

export function segmented(o: SegmentedOpts): Control {
  const name = `seg-${Math.random().toString(36).slice(2, 8)}`;
  const btns = o.options
    .map(
      (opt) => `<button type="button" class="seg-btn${opt.value === o.value ? " is-active" : ""}"
        role="radio" aria-checked="${opt.value === o.value}" data-value="${opt.value}"
        title="${opt.title ?? opt.label}" aria-label="${opt.label}">
        ${opt.icon ? `<span class="seg-icon">${iconSvg(opt.icon)}</span>` : ""}
        <span class="seg-label">${opt.label}</span>
      </button>`,
    )
    .join("");

  // A segmented control needs a per-option minimum width or its longest option
  // ellipsises. `minPerOption` is the natural width of the widest label (plus
  // its padding) supplied by the caller; the control sets it as a CSS custom
  // property so the layout is expressible in CSS rather than JS.
  const minW = o.minPerOption
    ? ` style="--seg-min: ${Math.ceil(o.minPerOption)}px"`
    : "";

  const el = row(
    o.label,
    `<div class="seg${o.stack ? " is-stacked" : ""}" role="radiogroup" aria-label="${o.label}" data-name="${name}"${minW}>${btns}</div>`,
  );
  let fn: ((v: unknown) => void) | null = null;

  el.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const already = b.classList.contains("is-active");
      // Selecting a different option must always commit, even when the control
      // currently has no selection at all. `already` only short-circuits a
      // re-click on the option that is already chosen.
      if (already && !o.allowEmpty) {
        fn && fn(b.dataset.value);
        return;
      }
      el.querySelectorAll(".seg-btn").forEach((x) => {
        x.classList.remove("is-active");
        x.setAttribute("aria-checked", "false");
      });
      if (already) {
        fn && fn("");
      } else {
        b.classList.add("is-active");
        b.setAttribute("aria-checked", "true");
        fn && fn(b.dataset.value);
      }
    });
  });

  return {
    el,
    read: () => el.querySelector<HTMLButtonElement>(".seg-btn.is-active")?.dataset.value ?? "",
    write: (v) => {
      el.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => {
        const on = b.dataset.value === String(v);
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", String(on));
      });
    },
    onChange: (f) => (fn = f),
    setDisabled: (d) => el.querySelectorAll("button").forEach((b) => (b.disabled = d)),
  };
}

/* ── Select ─────────────────────────────────────────────────────────────── */

export interface SelectOpts {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  /** Render as a wide dropdown rather than a narrow field. */
  wide?: boolean;
}

export function select(o: SelectOpts): Control {
  const id = `sel-${Math.random().toString(36).slice(2, 8)}`;
  const opts = o.options
    .map((opt) => `<option value="${opt.value}"${opt.value === o.value ? " selected" : ""}>${opt.label}</option>`)
    .join("");
  const el = row(
    o.label,
    `<div class="ctl-select-wrap${o.wide ? " is-wide" : ""}">
       <select class="ctl-select" id="${id}" aria-label="${o.label}">${opts}</select>
     </div>`,
  );
  const sel = el.querySelector<HTMLSelectElement>("select")!;
  let fn: ((v: unknown) => void) | null = null;
  sel.addEventListener("change", () => fn && fn(sel.value));
  return {
    el,
    read: () => sel.value,
    write: (v) => (sel.value = String(v)),
    onChange: (f) => (fn = f),
    setDisabled: (d) => (sel.disabled = d),
  };
}

/* ── Toggle ─────────────────────────────────────────────────────────────── */

export interface ToggleOpts {
  label: string;
  value: boolean;
}

export function toggle(o: ToggleOpts): Control {
  const id = `tg-${Math.random().toString(36).slice(2, 8)}`;
  const el = row(
    o.label,
    `<button type="button" class="switch${o.value ? " is-on" : ""}" id="${id}" role="switch"
       aria-checked="${o.value}" aria-label="${o.label}">
       <span class="switch-knob" aria-hidden="true"></span>
     </button>`,
  );
  const btn = el.querySelector<HTMLButtonElement>("button")!;
  let fn: ((v: unknown) => void) | null = null;
  btn.addEventListener("click", () => {
    const next = !btn.classList.contains("is-on");
    btn.classList.toggle("is-on", next);
    btn.setAttribute("aria-checked", String(next));
    fn && fn(next);
  });
  return {
    el,
    read: () => btn.classList.contains("is-on"),
    write: (v) => {
      const on = Boolean(v);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", String(on));
    },
    onChange: (f) => (fn = f),
    setDisabled: (d) => (btn.disabled = d),
  };
}

/* ── Text field ─────────────────────────────────────────────────────────── */

export interface TextOpts {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
}

export function textField(o: TextOpts): Control {
  const id = `tf-${Math.random().toString(36).slice(2, 8)}`;
  const el = row(
    o.label,
    `<input type="text" class="ctl-input${o.mono ? " is-mono" : ""}" id="${id}"
       value="${o.value}"${o.placeholder ? ` placeholder="${o.placeholder}"` : ""} aria-label="${o.label}">`,
  );
  const inp = el.querySelector<HTMLInputElement>("input")!;
  let fn: ((v: unknown) => void) | null = null;
  inp.addEventListener("input", () => fn && fn(inp.value));
  return {
    el,
    read: () => inp.value,
    write: (v) => (inp.value = String(v)),
    onChange: (f) => (fn = f),
    setDisabled: (d) => (inp.disabled = d),
  };
}

/* ── Collapsible section ────────────────────────────────────────────────── */

export interface SectionOpts {
  title: string;
  /** Render the header with an icon. */
  icon?: string;
  /** Open by default. */
  open?: boolean;
  /** Small actions pinned to the right of the header. */
  actions?: { icon: string; label: string; onClick: () => void }[];
}

export function section(o: SectionOpts): { el: HTMLElement; body: HTMLElement; setOpen: (b: boolean) => void } {
  const el = document.createElement("section");
  el.className = `prop-section${o.open === false ? " is-closed" : ""}`;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "prop-section-head";
  head.setAttribute("aria-expanded", String(o.open !== false));

  const icon = o.icon ? `<span class="prop-section-icon">${iconSvg(o.icon)}</span>` : "";
  head.innerHTML = `${icon}<span class="prop-section-title">${o.title}</span>`;

  if (o.actions?.length) {
    const acts = document.createElement("span");
    acts.className = "prop-section-actions";
    for (const a of o.actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-btn";
      b.title = a.label;
      b.setAttribute("aria-label", a.label);
      b.innerHTML = iconSvg(a.icon);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        a.onClick();
      });
      acts.appendChild(b);
    }
    head.appendChild(acts);
  }

  const chevron = document.createElement("span");
  chevron.className = "prop-section-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = iconSvg("chevron");
  head.appendChild(chevron);

  const body = document.createElement("div");
  body.className = "prop-section-body";

  head.addEventListener("click", () => {
    const closed = el.classList.toggle("is-closed");
    head.setAttribute("aria-expanded", String(!closed));
  });

  el.appendChild(head);
  el.appendChild(body);
  return {
    el,
    body,
    setOpen: (b) => {
      el.classList.toggle("is-closed", !b);
      head.setAttribute("aria-expanded", String(b));
    },
  };
}

/* ── Heading + description inside a section ─────────────────────────────── */

export function sectionNote(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "prop-note";
  p.textContent = text;
  return p;
}

/** Inline "reset to default" affordance for a section action slot. */
export function resetAction(onClick: () => void, label = "Reset section"): { icon: string; label: string; onClick: () => void } {
  return { icon: "reset", label, onClick };
}
