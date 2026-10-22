/**
 * LAYERS — Insert toolbar + component picker.
 *
 * The bottom bar mirrors the reference editor's: a floating pill of category
 * icons. Activating one opens a picker panel with a live search field, a
 * thumbnail grid of every component in that category, and a running count.
 *
 * Selecting a component adds it to the stack, selects it, and re-renders.
 * Search filters by component name and by any keyword in its blurb, so
 * "grain" finds Noise/Grain without the user having to know the category.
 */

import { iconSvg } from "./icons";
import type { CoreDef } from "./main";

export interface InsertHandlers {
  addCore: (coreName: string) => void;
  close: () => void;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  /** Matches against component labels + blurbs, case-insensitive. */
  match: (def: CoreDef) => boolean;
}

/**
 * Every core belongs to exactly one insert category. The predicate form keeps
 * this list declarative and lets a core be found by blurb text too.
 */
export const CATEGORIES: Category[] = [
  {
    id: "textures",
    label: "Textures",
    icon: "texture",
    match: (d) =>
      d.name === "pattern-dither" ||
      d.blurb.includes("noise") ||
      d.blurb.includes("grain") ||
      d.blurb.includes("pattern"),
  },
  {
    id: "adjust",
    label: "Adjustments",
    icon: "adjust",
    match: (d) => d.name === "color-blend" || d.blurb.includes("hue") || d.blurb.includes("saturation"),
  },
  {
    id: "blur",
    label: "Blurs",
    icon: "blur",
    match: (d) => d.name === "blur" || d.blurb.includes("blur"),
  },
  {
    id: "distort",
    label: "Distortions",
    icon: "distort",
    match: (d) => d.name === "displacement" || d.blurb.includes("displace"),
  },
  {
    id: "light",
    label: "Light & Shadow",
    icon: "shapes",
    match: (d) => d.name === "lighting" || d.blurb.includes("light") || d.blurb.includes("glow") || d.blurb.includes("vignette"),
  },
  {
    id: "edge",
    label: "Edges",
    icon: "shape",
    match: (d) => d.name === "outline" || d.blurb.includes("edge") || d.blurb.includes("outline"),
  },
];

/** Builds the floating toolbar and mounts it into `host`. */
export function mountInsertToolbar(host: HTMLElement, cores: CoreDef[], handlers: InsertHandlers): void {
  host.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "insert-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Add a core to the stack");

  for (const cat of CATEGORIES) {
    const members = cores.filter(cat.match);
    if (!members.length) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "insert-btn";
    btn.title = `${cat.label} — ${members.length} components`;
    btn.setAttribute("aria-label", `${cat.label}, ${members.length} components`);
    btn.setAttribute("aria-expanded", "false");
    btn.dataset.category = cat.id;
    // Icon plus a compact text label. An icon-only button whose SVG is
    // `aria-hidden` is exposed to the accessibility tree as an unnamed node,
    // which makes it untargetable in tests and unexplained to sighted users.
    //
    // The label span is hidden visually below 1150px (the bar needs 590px of
    // labelled buttons and the visible canvas is `viewport - 560`). It is hidden
    // with `clip`/`position:absolute` rather than `display:none`, so the button
    // keeps a real text node and stays nameable by text in the accessibility
    // tree at every width — `display:none` removed it from the tree entirely and
    // made the control untargetable in tests.
    btn.innerHTML =
      `${iconSvg(cat.icon)}` +
      `<span class="insert-btn-label">${cat.label}</span>` +
      `<span class="sr-only insert-btn-name">${cat.label}</span>`;

    btn.addEventListener("click", () => {
      const isOpen = picker && picker.classList.contains("is-open") && current === cat.id;
      if (isOpen) {
        closePicker();
        return;
      }
      openPicker(cat, members);
      bar.querySelectorAll(".insert-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-expanded", String(on));
      });
    });

    bar.appendChild(btn);
  }

  host.appendChild(bar);

  /* ── Picker ─────────────────────────────────────────────────────────── */

  let picker: HTMLElement | null = null;
  let current = "";

  function closePicker(): void {
    picker?.classList.remove("is-open");
    picker = null;
    current = "";
    bar.querySelectorAll(".insert-btn").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-expanded", "false");
    });
    handlers.close();
  }

  function openPicker(cat: Category, members: CoreDef[]): void {
    picker?.remove();

    const el = document.createElement("div");
    el.className = "picker is-open";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `${cat.label} components`);

    const head = document.createElement("div");
    head.className = "picker-head";
    head.innerHTML = `
      <span class="picker-title">${iconSvg(cat.icon)}<span>${cat.label}</span></span>
      <button type="button" class="icon-btn" data-close aria-label="Close component picker">${iconSvg("close")}</button>`;

    const search = document.createElement("input");
    search.type = "search";
    search.className = "picker-search";
    search.placeholder = "Search components…";
    search.setAttribute("aria-label", "Search components");
    search.autocomplete = "off";

    const grid = document.createElement("div");
    grid.className = "picker-grid";

    const count = document.createElement("div");
    count.className = "picker-count";

    function render(list: CoreDef[]): void {
      grid.innerHTML = "";
      count.textContent = `${list.length} component${list.length === 1 ? "" : "s"}`;
      for (const def of list) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "picker-card";
        card.innerHTML = `
          <span class="picker-card-icon">${iconSvg(def.iconName)}</span>
          <span class="picker-card-name">${def.label}</span>`;
        card.title = def.blurb;
        card.setAttribute("aria-label", `${def.label}. ${def.blurb}`);
        card.addEventListener("click", () => {
          handlers.addCore(def.name);
          closePicker();
        });
        grid.appendChild(card);
      }
      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "picker-empty";
        empty.textContent = `No components match “${search.value}”.`;
        grid.appendChild(empty);
      }
    }

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      if (!q) return render(members);
      render(
        members.filter(
          (d) =>
            d.label.toLowerCase().includes(q) ||
            d.blurb.toLowerCase().includes(q) ||
            d.name.includes(q),
        ),
      );
    });

    el.append(head, search, grid, count);
    host.appendChild(el);
    picker = el;
    current = cat.id;
    render(members);

    head.querySelector("[data-close]")!.addEventListener("click", closePicker);

    // Focus the search field so typing filters immediately.
    window.requestAnimationFrame(() => search.focus());
  }
}
