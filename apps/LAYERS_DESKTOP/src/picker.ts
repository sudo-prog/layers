/**
 * The component picker — a centred sheet over the canvas.
 *
 * Category tabs + a search field + a grid of cores. The count in the footer is
 * per-category, which is how the reference editor behaves; a single global count
 * is misleading once categories are filtered.
 */

import { CATEGORIES, CORE_DEFS, type CategoryId, type CoreDef } from "./cores.js";
import { iconSvg } from "./icons.js";

export interface PickerHandlers {
  add: (def: CoreDef) => void;
  close: () => void;
}

let scrim: HTMLElement | null = null;
let activeCat: CategoryId = "textures";
let query = "";
let handlers: PickerHandlers | null = null;

export function initPicker(h: PickerHandlers): void {
  handlers = h;
  scrim = document.getElementById("picker-scrim");
  if (!scrim) return;

  document.getElementById("picker-close")?.addEventListener("click", closePicker);
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) closePicker();
  });

  const search = document.getElementById("picker-search") as HTMLInputElement | null;
  search?.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    renderGrid();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) closePicker();
  });

  renderCats();
  renderGrid();
}

export function isOpen(): boolean {
  return !!scrim && !scrim.classList.contains("hidden");
}

export function openPicker(cat: CategoryId = "textures"): void {
  activeCat = cat;
  query = "";
  const search = document.getElementById("picker-search") as HTMLInputElement | null;
  if (search) search.value = "";
  scrim?.classList.remove("hidden");
  renderCats();
  renderGrid();
  search?.focus();
}

export function closePicker(): void {
  scrim?.classList.add("hidden");
  handlers?.close();
}

/** Cores matching the active category and the search query. */
export function filtered(cores: CoreDef[], cat: CategoryId, q: string): CoreDef[] {
  // Lowercase the query AND the haystack. Lowercasing only the query means a
  // search for "DITHER" never matches "Dither" — the caller's casing leaks in.
  const needle = q.trim().toLowerCase();
  return cores.filter((c) => {
    if (c.category !== cat) return false;
    if (!needle) return true;
    return (
      c.label.toLowerCase().includes(needle) ||
      c.name.toLowerCase().includes(needle) ||
      c.blurb.toLowerCase().includes(needle)
    );
  });
}

function renderCats(): void {
  const host = document.getElementById("picker-cats");
  if (!host) return;
  host.innerHTML = "";
  for (const cat of CATEGORIES) {
    const n = CORE_DEFS.filter((c) => c.category === cat.id).length;
    if (!n) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "picker-cat" + (cat.id === activeCat ? " is-active" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(cat.id === activeCat));
    b.textContent = cat.label;
    b.addEventListener("click", () => {
      activeCat = cat.id;
      renderCats();
      renderGrid();
    });
    host.appendChild(b);
  }
}

function renderGrid(): void {
  const grid = document.getElementById("picker-grid");
  const count = document.getElementById("picker-count");
  const title = document.getElementById("picker-title");
  if (!grid) return;

  const list = filtered(CORE_DEFS, activeCat, query);
  const cat = CATEGORIES.find((c) => c.id === activeCat);
  if (title) title.textContent = cat ? cat.label : "Components";
  if (count) count.textContent = `${list.length} ${list.length === 1 ? "component" : "components"}`;

  grid.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = query ? `No components match “${query}”.` : "Nothing in this category yet.";
    grid.appendChild(empty);
    return;
  }

  for (const def of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "picker-item";
    b.setAttribute("aria-label", `Add ${def.label}`);
    b.innerHTML =
      `<span class="tree-row-icon">${iconSvg(def.category)}</span>` +
      `<span class="picker-item-name">${def.label}</span>` +
      `<span class="picker-item-blurb">${def.blurb}</span>`;
    b.addEventListener("click", () => {
      handlers?.add(def);
      closePicker();
    });
    grid.appendChild(b);
  }
}
