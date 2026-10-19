/**
 * Mobile navigation — bottom tab bar for small screens.
 *
 * On mobile (<768px), the 3-panel desktop layout collapses into a single
 * canvas view with a bottom tab bar. Tapping a tab shows the corresponding
 * panel as a full-screen overlay.
 */

import { openPresetPanel } from "./main";

type TabId = "canvas" | "cores" | "stack" | "presets";

export function initMobileNav(): void {
  const tabbar = document.querySelector<HTMLElement>(".mobile-tabbar");
  if (!tabbar) return;

  const buttons = Array.from(
    tabbar.querySelectorAll<HTMLButtonElement>(".mobile-tabbar-btn"),
  );
  const coresPanel = document.querySelector<HTMLElement>(".panel-left");
  const stackPanel = document.querySelector<HTMLElement>(".panel-right");

  function activateTab(tab: TabId): void {
    // Update button states
    for (const btn of buttons) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    }

    // Show/hide panels
    coresPanel?.classList.toggle("active", tab === "cores");
    stackPanel?.classList.toggle("active", tab === "stack");

    // Close preset panel if switching away from presets
    if (tab !== "presets") {
      document.getElementById("preset-panel")?.remove();
    }

    // Open preset panel if switching to presets
    if (tab === "presets") {
      void openPresetPanel();
    }
  }

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as TabId;
      activateTab(tab);
    });
  }

  // Handle viewport resize — reset state when crossing the breakpoint
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", (e) => {
    if (e.matches) {
      // Switched to desktop — reset everything
      coresPanel?.classList.remove("active");
      stackPanel?.classList.remove("active");
      for (const btn of buttons) {
        btn.classList.remove("active");
      }
    } else {
      // Switched to mobile — start on canvas
      activateTab("canvas");
    }
  });

  // Start on canvas
  activateTab("canvas");
}
