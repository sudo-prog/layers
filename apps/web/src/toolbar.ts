/**
 * Toolbar presentation: SVG icon hydration, icon-only mobile rendering, and the
 * overflow sheet that holds secondary actions at phone widths.
 *
 * The desktop toolbar carries every action with an icon + text label. At phone
 * widths that is 15 controls in ~390px — far more than fits, and a horizontally
 * scrolling toolbar hides most of them off-screen. Instead, mobile keeps the two
 * primary actions (undo/redo) as icon-only buttons plus a "More" trigger, and the
 * secondary buttons are *moved* (not cloned) into a bottom sheet so their existing
 * event listeners survive.
 */

import { iconSvg } from "./icons";

/** Width at or above which every toolbar action fits inline as icon-only buttons. */
const WIDE_QUERY = "(min-width: 1000px)";

/** Wrap a button's label in `.btn-icon` + `.btn-label` spans so CSS can drop the text. */
export function decorateButton(btn: HTMLButtonElement): void {
  const name = btn.dataset.icon;
  if (!name || btn.querySelector(".btn-icon")) return;
  // Labels may live in `aria-label` when the markup ships icon-only.
  const label = (btn.textContent || "").trim() || btn.getAttribute("aria-label") || name;
  btn.dataset.label = label;
  btn.innerHTML = `<span class="btn-icon">${iconSvg(name)}</span><span class="btn-label">${label}</span>`;
}

/** Replace a button's icon and label in place (used by the theme toggle). */
export function setButtonContent(btn: HTMLButtonElement, icon: string, label: string): void {
  btn.dataset.icon = icon;
  btn.dataset.label = label;
  btn.innerHTML = `<span class="btn-icon">${iconSvg(icon)}</span><span class="btn-label">${label}</span>`;
}

export interface ToolbarButtonSpec {
  id?: string;
  icon: string;
  label: string;
  title?: string;
  /** Secondary actions collapse into the mobile overflow sheet. */
  secondary?: boolean;
}

/** Build a fully-decorated toolbar button. */
export function createToolbarButton(spec: ToolbarButtonSpec): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "btn" + (spec.secondary ? " btn-secondary" : "");
  if (spec.id) btn.id = spec.id;
  if (spec.title) btn.title = spec.title;
  btn.setAttribute("aria-label", spec.label);
  setButtonContent(btn, spec.icon, spec.label);
  return btn;
}

/** Hydrate icons on the static toolbar buttons declared in index.html. */
export function decorateToolbar(): void {
  document
    .querySelectorAll<HTMLButtonElement>(".toolbar .btn[data-icon]")
    .forEach(decorateButton);
}

/**
 * Hydrate buttons that carry only `data-icon` / `data-label` (no child markup):
 * the mask toolbar and vector panel buttons declared in index.html.
 */
export function decorateLabelledButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".btn[data-label]").forEach((btn) => {
    if (btn.querySelector(".btn-label")) return;
    const label = btn.dataset.label!;
    const icon = btn.dataset.icon;
    btn.innerHTML = icon
      ? `<span class="btn-icon">${iconSvg(icon)}</span><span class="btn-label">${label}</span>`
      : `<span class="btn-label">${label}</span>`;
    if (!btn.getAttribute("aria-label")) btn.setAttribute("aria-label", label);
  });
}

/** Hydrate icons on the bottom tab bar. */
export function decorateTabBar(): void {
  document.querySelectorAll<HTMLElement>(".mobile-tabbar-icon[data-icon]").forEach((el) => {
    el.innerHTML = iconSvg(el.dataset.icon!);
  });
}

/**
 * Wire the mobile overflow sheet.
 *
 * On mobile the `.btn-secondary` buttons are appended to the sheet's grid; on
 * desktop they return to the exact slot they came from, tracked by a comment
 * anchor left in place when the button first moves.
 */
export function initToolbarOverflow(): void {
  const actions = document.querySelector<HTMLElement>(".toolbar-actions");
  const more = document.getElementById("btn-more") as HTMLButtonElement | null;
  if (!actions || !more) return;
  // Idempotent: init runs from initStage06 and may be re-entered on HMR.
  if (document.getElementById("more-sheet")) return;

  decorateToolbar();
  decorateLabelledButtons();

  const backdrop = document.createElement("div");
  backdrop.className = "more-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "more-sheet";
  sheet.id = "more-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "More actions");
  sheet.innerHTML = `<p class="more-sheet-title">More actions</p><div class="more-sheet-grid"></div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const grid = sheet.querySelector<HTMLElement>(".more-sheet-grid")!;

  const isOpen = () => sheet.classList.contains("open");
  const open = () => {
    backdrop.classList.add("open");
    sheet.classList.add("open");
    more.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    more.setAttribute("aria-expanded", "false");
  };

  more.addEventListener("click", () => (isOpen() ? close() : open()));
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  const anchors = new WeakMap<HTMLElement, Comment>();
  const secondaries = () =>
    Array.from(actions.querySelectorAll<HTMLButtonElement>(".btn-secondary"));

  const mq = window.matchMedia(WIDE_QUERY);
  const place = () => {
    const list = secondaries();

    // Leave an anchor in each button's original slot so wide layout order is
    // restored when there is room for the full row.
    for (const btn of list) {
      if (!anchors.has(btn)) {
        const anchor = document.createComment("toolbar-anchor");
        btn.after(anchor);
        anchors.set(btn, anchor);
      }
    }

    if (mq.matches) {
      close();
      for (const btn of list) {
        const anchor = anchors.get(btn);
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);
      }
    } else {
      for (const btn of list) grid.appendChild(btn);
    }
  };

  mq.addEventListener("change", place);
  place();
}
