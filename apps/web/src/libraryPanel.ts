/**
 * Library panel — searchable, filterable preset browser (Stage 2.2).
 *
 * Unlike the one-tap preset grid, this panel exposes the full sharing
 * workflow: search, tag/category/visibility filters, per-card visibility
 * control, deep links, import/export and delete.
 *
 * Thumbnails: the host may supply `getThumbnail`. When it returns null a
 * deterministic gradient derived from the preset name is used, so every
 * preset gets a stable, distinct placeholder with zero dependencies.
 */

import { estimatePasses, isMobileOk, type StackState } from "@layers/stack";
import { presetStore, type PresetRecord } from "./presetStore";
import {
  copyToClipboard,
  exportPresetFile,
  exportPresetLink,
  importPresetFile,
  type Visibility,
} from "./presetShare";

export interface LibraryPanelOptions {
  /** Apply a preset's stack to the editor. */
  onApply: (stack: StackState) => void;
  /** Returns the current stack for the "save" action. */
  getCurrentStack: () => StackState;
  /** Optional thumbnail lookup; return null for the generated placeholder. */
  getThumbnail?: (record: PresetRecord) => string | null;
}

export interface LibraryPanelHandle {
  refresh: () => Promise<void>;
  destroy: () => void;
}

const MOBILE_PASS_BUDGET = 8;
const VISIBILITY_META: Record<Visibility, { icon: string; label: string }> = {
  private: { icon: "🔒", label: "Private" },
  unlisted: { icon: "🔗", label: "Unlisted" },
  public: { icon: "🌐", label: "Public" },
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Deterministic 32-bit hash for stable placeholder colours. */
function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable two-stop gradient placeholder — no image data needed. */
function placeholderStyle(name: string): string {
  const h = hashName(name);
  const a = h % 360;
  const b = (a + 40 + (h % 60)) % 360;
  return `background: linear-gradient(135deg, hsl(${a} 65% 55%), hsl(${b} 65% 40%))`;
}

function passesFor(record: PresetRecord): number {
  return estimatePasses(record.stack.items);
}

export async function mountLibraryPanel(
  container: HTMLElement,
  opts: LibraryPanelOptions,
): Promise<LibraryPanelHandle> {
  container.innerHTML = "";
  container.classList.add("library-container");

  let query = "";
  let visibilityFilter: Visibility | "all" = "all";
  let activeTag: string | null = null;

  // ── Header ────────────────────────────────────────────────────────────
  const header = el("div", "library-header");
  header.appendChild(el("h2", "library-title", "Library"));

  const actions = el("div", "library-actions");

  const btnSave = el("button", "btn btn-primary library-btn", "Save current stack");
  btnSave.addEventListener("click", async () => {
    const name = window.prompt("Preset name:");
    if (!name || !name.trim()) return;
    try {
      await presetStore.savePreset(name, opts.getCurrentStack());
      await refresh();
    } catch (e) {
      window.alert(`Could not save preset: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  actions.appendChild(btnSave);

  const btnImport = el("button", "btn library-btn", "Import JSON");
  const fileInput = el("input", "library-file-input") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.style.display = "none";
  btnImport.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const obj = importPresetFile(text);
      if (!obj) {
        window.alert("That file is not a valid LAYERS preset.");
        return;
      }
      // importPresetFile only shape-checks; the store re-validates against
      // the real schema and throws a descriptive error.
      await presetStore.importPresetJson(text);
      await refresh();
    } catch (e) {
      window.alert(`Could not import preset: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  actions.appendChild(btnImport);
  actions.appendChild(fileInput);

  const btnClose = el("button", "btn library-close", "✕");
  btnClose.setAttribute("aria-label", "Close library");
  btnClose.addEventListener("click", () => container.remove());
  actions.appendChild(btnClose);

  header.appendChild(actions);
  container.appendChild(header);

  // ── Search + filters ──────────────────────────────────────────────────
  const search = el("input", "library-search") as HTMLInputElement;
  search.type = "search";
  search.placeholder = "Search presets…";
  search.setAttribute("aria-label", "Search presets");
  search.addEventListener("input", () => {
    query = search.value;
    void renderGrid();
  });
  container.appendChild(search);

  const filters = el("div", "library-filters");
  container.appendChild(filters);

  const grid = el("div", "library-grid");
  container.appendChild(grid);

  // ── Filter chips ──────────────────────────────────────────────────────
  function renderFilters(all: PresetRecord[]): void {
    filters.innerHTML = "";

    const visibilities: Array<Visibility | "all"> = ["all", "private", "unlisted", "public"];
    for (const v of visibilities) {
      const chip = el("button", "library-chip");
      if (v === "all") {
        chip.textContent = "All";
      } else {
        const meta = VISIBILITY_META[v];
        chip.textContent = `${meta.icon} ${meta.label}`;
      }
      if (visibilityFilter === v) chip.classList.add("active");
      chip.addEventListener("click", () => {
        visibilityFilter = v;
        void renderFilters(currentRecords);
        void renderGrid();
      });
      filters.appendChild(chip);
    }

    const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
    for (const tag of tags) {
      const chip = el("button", "library-chip library-chip-tag", `#${tag}`);
      if (activeTag === tag) chip.classList.add("active");
      chip.addEventListener("click", () => {
        activeTag = activeTag === tag ? null : tag;
        void renderFilters(currentRecords);
        void renderGrid();
      });
      filters.appendChild(chip);
    }
  }

  // ── Grid ──────────────────────────────────────────────────────────────
  let currentRecords: PresetRecord[] = [];

  async function renderGrid(): Promise<void> {
    grid.innerHTML = "";
    let records: PresetRecord[];
    try {
      records = await presetStore.searchPresets(query, {
        visibility: visibilityFilter === "all" ? undefined : visibilityFilter,
        tags: activeTag ? [activeTag] : undefined,
      });
    } catch {
      records = [];
    }
    currentRecords = records;

    if (records.length === 0) {
      const empty = el("div", "library-empty");
      const hasAny = (await presetStore.listPresets().catch(() => [] as PresetRecord[])).length > 0;
      empty.appendChild(
        el("p", "library-empty-text", hasAny ? "No presets match your search." : "No presets yet."),
      );
      empty.appendChild(
        el(
          "p",
          "library-empty-hint",
          hasAny ? "Try clearing the search or filters." : 'Tap "Save current stack" to create one.',
        ),
      );
      grid.appendChild(empty);
      return;
    }

    for (const record of records) {
      grid.appendChild(renderCard(record));
    }
  }

  function renderCard(record: PresetRecord): HTMLElement {
    const card = el("div", "library-card");
    card.setAttribute("data-preset-id", record.id);

    // Thumbnail (host-provided or deterministic placeholder)
    const thumb = el("div", "library-thumb");
    const src = opts.getThumbnail?.(record) ?? null;
    if (src) {
      const img = el("img", "library-thumb-img") as HTMLImageElement;
      img.src = src;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.setAttribute("style", placeholderStyle(record.name));
      thumb.setAttribute("aria-hidden", "true");
    }
    card.appendChild(thumb);

    const body = el("div", "library-card-body");
    body.appendChild(el("span", "library-card-name", record.name));

    const passes = passesFor(record);
    const badge = el("span", "library-card-badge", `${passes} pass${passes === 1 ? "" : "es"}`);
    if (!isMobileOk(passes)) {
      badge.classList.add("over-budget");
      badge.title = `Over mobile budget (${MOBILE_PASS_BUDGET} passes)`;
    }
    body.appendChild(badge);

    const vis = VISIBILITY_META[record.visibility];
    const visBadge = el("span", "library-card-visibility", `${vis.icon} ${vis.label}`);
    visBadge.title = `Visibility: ${vis.label}`;
    body.appendChild(visBadge);

    if (record.category) {
      body.appendChild(el("span", "library-card-category", record.category));
    }

    if (record.tags.length > 0) {
      const tagRow = el("div", "library-card-tags");
      for (const tag of record.tags.slice(0, 4)) {
        tagRow.appendChild(el("span", "library-card-tag", tag));
      }
      body.appendChild(tagRow);
    }

    if (record.description) {
      body.appendChild(el("span", "library-card-desc", record.description));
    }
    card.appendChild(body);

    // Actions
    const cardActions = el("div", "library-card-actions");

    const btnApply = el("button", "btn library-card-action", "Apply");
    btnApply.addEventListener("click", async () => {
      try {
        const stack = await presetStore.loadPreset(record.id);
        if (stack) opts.onApply(stack);
      } catch (e) {
        window.alert(`Could not load preset: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    cardActions.appendChild(btnApply);

    const btnLink = el("button", "btn library-card-action", "Copy link");
    btnLink.title = "Copy a deep link to this preset";
    btnLink.addEventListener("click", async () => {
      const ok = await copyToClipboard(exportPresetLink(record));
      btnLink.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => (btnLink.textContent = "Copy link"), 1500);
    });
    cardActions.appendChild(btnLink);

    const btnExport = el("button", "btn library-card-action", "Export");
    btnExport.title = "Download preset JSON";
    btnExport.addEventListener("click", () => {
      const blob = new Blob([exportPresetFile(record)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    cardActions.appendChild(btnExport);

    const btnVis = el("button", "btn library-card-action", `${vis.icon} ${vis.label}`);
    btnVis.title = "Change visibility";
    btnVis.addEventListener("click", async () => {
      const order: Visibility[] = ["private", "unlisted", "public"];
      const next = order[(order.indexOf(record.visibility) + 1) % order.length];
      try {
        await presetStore.setVisibility(record.id, next);
        await refresh();
      } catch (e) {
        window.alert(`Could not change visibility: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    cardActions.appendChild(btnVis);

    const btnDelete = el("button", "btn library-card-action library-card-delete", "✕");
    btnDelete.title = "Delete preset";
    btnDelete.setAttribute("aria-label", `Delete preset ${record.name}`);
    btnDelete.addEventListener("click", async () => {
      if (!window.confirm(`Delete preset "${record.name}"?`)) return;
      try {
        await presetStore.deletePreset(record.id);
        await refresh();
      } catch (e) {
        window.alert(`Could not delete preset: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    cardActions.appendChild(btnDelete);

    card.appendChild(cardActions);
    return card;
  }

  async function refresh(): Promise<void> {
    const all = await presetStore.listPresets().catch(() => [] as PresetRecord[]);
    renderFilters(all);
    await renderGrid();
  }

  await refresh();

  return {
    refresh,
    destroy() {
      container.innerHTML = "";
      container.classList.remove("library-container");
    },
  };
}
