/**
 * Preset grid UI — responsive grid of preset cards with one-tap apply.
 *
 * All DOM is created programmatically; the caller provides a container
 * element. Cards show the preset name, a pass-count badge (over-budget
 * presets highlighted in the error colour), and tags.
 */

import { estimatePasses, isMobileOk, type StackState } from "@layers/stack";
import { presetStore, type PresetRecord } from "./presetStore";

export interface PresetGridOptions {
  /** Called with the loaded StackState when a card is tapped. */
  onApply: (stack: StackState) => void;
  /** Returns the current stack to save when the user taps "Save current stack". */
  getCurrentStack: () => StackState;
}

export interface PresetGridHandle {
  /** Re-fetch presets from the store and re-render the grid. */
  refresh: () => Promise<void>;
  /** Remove all DOM created by this grid. */
  destroy: () => void;
}

const MOBILE_PASS_BUDGET = 8;

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

function passesFor(record: PresetRecord): number {
  return estimatePasses(record.stack.items);
}

export async function mountPresetGrid(
  container: HTMLElement,
  opts: PresetGridOptions,
): Promise<PresetGridHandle> {
  container.innerHTML = "";
  container.classList.add("preset-grid-container");

  // ── Header: title + actions ──────────────────────────────────────────
  const header = el("div", "preset-grid-header");
  header.appendChild(el("h2", "preset-grid-title", "Presets"));

  const actions = el("div", "preset-grid-actions");

  const btnSave = el("button", "btn btn-primary preset-grid-btn", "Save current stack");
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

  const btnImport = el("button", "btn preset-grid-btn", "Import JSON");
  const fileInput = el("input", "preset-grid-file-input") as HTMLInputElement;
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
      await presetStore.importPresetJson(text);
      await refresh();
    } catch (e) {
      window.alert(`Could not import preset: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  actions.appendChild(btnImport);
  actions.appendChild(fileInput);

  header.appendChild(actions);
  container.appendChild(header);

  // ── Grid body ────────────────────────────────────────────────────────
  const grid = el("div", "preset-grid");
  container.appendChild(grid);

  // ── Render ───────────────────────────────────────────────────────────
  async function render(): Promise<void> {
    grid.innerHTML = "";
    let presets: PresetRecord[];
    try {
      presets = await presetStore.listPresets();
    } catch {
      presets = [];
    }

    if (presets.length === 0) {
      const empty = el("div", "preset-grid-empty");
      empty.appendChild(el("p", "preset-grid-empty-text", "No presets yet."));
      empty.appendChild(
        el("p", "preset-grid-empty-hint", "Tap \"Save current stack\" to create one."),
      );
      grid.appendChild(empty);
      return;
    }

    for (const record of presets) {
      grid.appendChild(renderCard(record));
    }
  }

  function renderCard(record: PresetRecord): HTMLElement {
    const card = el("div", "preset-card");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("data-preset-id", record.id);
    card.setAttribute("aria-label", `Apply preset ${record.name}`);

    // One-tap apply — click works on touch with touch-action: manipulation.
    const apply = async () => {
      try {
        const stack = await presetStore.loadPreset(record.id);
        if (stack) opts.onApply(stack);
      } catch (e) {
        window.alert(`Could not load preset: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    card.addEventListener("click", (e) => {
      // Ignore clicks originating from the card action buttons.
      if ((e.target as HTMLElement).closest(".preset-card-actions")) return;
      void apply();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void apply();
      }
    });

    // Name
    card.appendChild(el("span", "preset-card-name", record.name));

    // Pass-count badge
    const passes = passesFor(record);
    const badge = el("span", "preset-card-badge", `${passes} pass${passes === 1 ? "" : "es"}`);
    if (!isMobileOk(passes)) {
      badge.classList.add("over-budget");
      badge.title = `Over mobile budget (${MOBILE_PASS_BUDGET} passes)`;
    }
    card.appendChild(badge);

    // Tags
    if (record.tags.length > 0) {
      const tagRow = el("div", "preset-card-tags");
      for (const tag of record.tags.slice(0, 4)) {
        tagRow.appendChild(el("span", "preset-card-tag", tag));
      }
      card.appendChild(tagRow);
    }

    // Description (optional, truncated)
    if (record.description) {
      card.appendChild(el("span", "preset-card-desc", record.description));
    }

    // Card actions row
    const cardActions = el("div", "preset-card-actions");

    const btnExport = el("button", "btn preset-card-action", "Export");
    btnExport.type = "button";
    btnExport.title = "Download preset JSON";
    btnExport.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const json = await presetStore.exportPresetJson(record.id);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${record.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        window.alert(`Could not export preset: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    cardActions.appendChild(btnExport);

    const btnDelete = el("button", "btn preset-card-action preset-card-delete", "✕");
    btnDelete.type = "button";
    btnDelete.title = "Delete preset";
    btnDelete.setAttribute("aria-label", `Delete preset ${record.name}`);
    btnDelete.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete preset "${record.name}"?`)) return;
      try {
        await presetStore.deletePreset(record.id);
        await render();
      } catch (err) {
        window.alert(`Could not delete preset: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    cardActions.appendChild(btnDelete);

    card.appendChild(cardActions);
    return card;
  }

  async function refresh(): Promise<void> {
    await render();
  }

  await render();

  return {
    refresh,
    destroy() {
      container.innerHTML = "";
      container.classList.remove("preset-grid-container");
    },
  };
}
