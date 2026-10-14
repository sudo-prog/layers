/**
 * Comparison Tools UI — overlay for detailed comparison between source and reconstruction.
 *
 * Mounts a self-contained panel into any HTMLElement. The panel provides:
 *   (a) Split-view — draggable divider, left = reference, right = reconstruction
 *   (b) Onion-skin — overlay both with an opacity slider (0–100%)
 *   (c) Difference map — per-pixel abs diff rendered as a heatmap
 *   (d) Isolate layer — dropdown of stack items; temporarily disables others, renders, captures
 *
 * The caller supplies callbacks to read the current stack, renderer, source canvas,
 * and to send actions (e.g., to close the overlay).
 */

import type { StackItem, StackState } from "@layers/stack";
import type { Renderer } from "@layers/engine";
import { applyTheme, generateCSSVariables } from "@layers/ui";

export interface ComparisonToolsOptions {
  /** Returns the current stack state (the editor's live state). */
  getCurrentStack: () => StackState;
  /** Returns the current renderer instance (or null if not initialized). */
  getRenderer: () => Renderer | null;
  /** Returns the source canvas (the uploaded source or default gradient). */
  getSourceCanvas: () => HTMLCanvasElement | null;
  /** Returns the live WebGL output canvas (the rendered reconstruction). */
  getCanvas: () => HTMLCanvasElement | null;
  /**
   * Ask the host to render only the given stack item (or the full stack when
   * null). The host owns the render loop, so it must apply/restore the state.
   */
  onIsolate?: (itemId: string | null) => void;
  /** Called when an action is triggered inside the panel (e.g., close). */
  onAction: (action: string, payload?: unknown) => void;
}

export interface ComparisonToolsHandle {
  /** Remove all DOM created by this panel. */
  destroy(): void;
  /** Refresh the content (call when stack or source changes). */
  refresh(): void;
}

/**
 * Mount the comparison tools overlay into the given container.
 * @param container - The HTMLElement to mount into (usually document.body)
 * @param options - Callbacks and getters for interacting with the app state
 * @returns A handle with destroy and refresh methods
 */
export function mountComparisonTools(container: HTMLElement, options: ComparisonToolsOptions): ComparisonToolsHandle {
  // State
  let isMounted = true;
  let overlay: HTMLElement | null = null;
  let modal: HTMLElement | null = null;
  let activeTool = "split"; // split, onion, diff, isolate

  // Create the overlay and modal
  overlay = document.createElement("div");
  overlay.className = "compare-overlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      options.onAction("close");
    }
  });

  modal = document.createElement("div");
  modal.className = "compare-modal";

  // Create tool selector
  const toolContainer = document.createElement("div");
  toolContainer.className = "compare-tools";
  const tools = [
    { id: "split", label: "Split-view", icon: "↔️" },
    { id: "onion", label: "Onion-skin", icon: "🧅" },
    { id: "diff", label: "Difference map", icon: "🔥" },
    { id: "isolate", label: "Isolate layer", icon: "🔍" },
  ];
  tools.forEach((tool) => {
    const btn = document.createElement("button");
    btn.className = "compare-tool-btn";
    btn.textContent = `${tool.icon} ${tool.label}`;
    btn.addEventListener("click", () => {
      setActiveTool(tool.id);
    });
    toolContainer.appendChild(btn);
  });

  // Create content container
  const contentContainer = document.createElement("div");
  contentContainer.className = "compare-content";

  // Assemble modal
  modal.appendChild(toolContainer);
  modal.appendChild(contentContainer);
  overlay.appendChild(modal);

  // Add to container
  container.appendChild(overlay);

  // Set initial active tool
  setActiveTool("split");

  // Function to set active tool
  function setActiveTool(tool: string) {
    if (!isMounted) return;
    activeTool = tool;
    // Update button active states
    const btns = toolContainer.querySelectorAll(".compare-tool-btn");
    btns.forEach((btn, index) => {
      btn.classList.toggle("active", tools[index].id === tool);
    });
    // Refresh the content
    refreshContent();
  }

  // Function to refresh the content based on active tool
  function refreshContent() {
    if (!isMounted) return;
    contentContainer.innerHTML = "";
    switch (activeTool) {
      case "split":
        renderSplitView(contentContainer, options);
        break;
      case "onion":
        renderOnionSkin(contentContainer, options);
        break;
      case "diff":
        renderDifferenceMap(contentContainer, options);
        break;
      case "isolate":
        renderIsolateLayer(contentContainer, options);
        break;
    }
  }

  // Split-view: draggable divider
  function renderSplitView(container: HTMLElement, options: ComparisonToolsOptions) {
    const wrapper = document.createElement("div");
    wrapper.className = "split-view";
    container.appendChild(wrapper);

    // Left side: reference
    const left = document.createElement("div");
    left.className = "split-left";
    wrapper.appendChild(left);
    const leftImg = document.createElement("img");
    leftImg.style.width = "100%";
    leftImg.style.height = "100%";
    left.appendChild(leftImg);
    updateReferenceImage(leftImg, options.getSourceCanvas());

    // Right side: reconstruction
    const right = document.createElement("div");
    right.className = "split-right";
    wrapper.appendChild(right);
    const rightImg = document.createElement("img");
    rightImg.style.width = "100%";
    rightImg.style.height = "100%";
    right.appendChild(rightImg);
    updateReconstructionImage(rightImg, options.getRenderer());

    // Draggable handle
    const handle = document.createElement("div");
    handle.className = "split-handle";
    handle.textContent = "⇄";
    wrapper.appendChild(handle);

    // Make it draggable
    let isDragging = false;
    const startDrag = (e: MouseEvent) => {
      isDragging = true;
      e.preventDefault();
    };
    const stopDrag = () => {
      isDragging = false;
    };
    const drag = (e: MouseEvent) => {
      if (!isDragging) return;
      const rect = wrapper.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      handle.style.left = `${percent * 100}%`;
      left.style.width = `${percent * 100}%`;
      right.style.width = `${(1 - percent) * 100}%`;
    };
    handle.addEventListener("pointerdown", startDrag);
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointerleave", stopDrag);
    window.addEventListener("pointermove", drag as EventListener);
    window.addEventListener("pointerup", stopDrag);

    // Cleanup on destroy
    const destroyCleanup = () => {
      window.removeEventListener("pointermove", drag as EventListener);
      window.removeEventListener("pointerup", stopDrag);
    };
    // We'll call this in the handle.destroy() - for now we'll store it
    (handle as any).__destroyCleanup = destroyCleanup;
  }

  // Onion-skin: overlay with opacity slider
  function renderOnionSkin(container: HTMLElement, options: ComparisonToolsOptions) {
    const wrapper = document.createElement("div");
    wrapper.className = "onion-skin-wrapper";
    container.appendChild(wrapper);

    // Reference layer
    const refImg = document.createElement("img");
    refImg.className = "onion-reference";
    refImg.style.position = "absolute";
    refImg.style.top = "0";
    refImg.style.left = "0";
    wrapper.appendChild(refImg);
    updateReferenceImage(refImg, options.getSourceCanvas());

    // Reconstruction layer
    const reconImg = document.createElement("img");
    reconImg.className = "onion-reconstruction";
    reconImg.style.position = "absolute";
    reconImg.style.top = "0";
    reconImg.style.left = "0";
    wrapper.appendChild(reconImg);
    updateReconstructionImage(reconImg, options.getRenderer());

    // Slider container
    const sliderContainer = document.createElement("div");
    sliderContainer.className = "onion-slider-container";
    wrapper.appendChild(sliderContainer);

    const sliderLabel = document.createElement("label");
    sliderLabel.textContent = "Onion opacity: ";
    sliderContainer.appendChild(sliderLabel);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "50";
    slider.className = "onion-slider";
    sliderContainer.appendChild(slider);

    const sliderValue = document.createElement("span");
    sliderValue.textContent = "50%";
    sliderContainer.appendChild(sliderValue);

    // Update images and slider
    function updateOnion() {
      const opacity = parseInt(slider.value) / 100;
      refImg.style.opacity = `${1 - opacity}`;
      reconImg.style.opacity = `${opacity}`;
      sliderValue.textContent = `${slider.value}%`;
    }

    slider.addEventListener("input", updateOnion);
    // Initial update
    updateOnion();
  }

  // Difference map: per-pixel abs diff as heatmap
  function renderDifferenceMap(container: HTMLElement, options: ComparisonToolsOptions) {
    const wrapper = document.createElement("div");
    wrapper.className = "diff-map-wrapper";
    container.appendChild(wrapper);

    const canvas = document.createElement("canvas");
    canvas.className = "diff-canvas";
    wrapper.appendChild(canvas);

    // We'll update this periodically or on refresh
    function updateDiffMap() {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const source = options.getSourceCanvas();
      const renderer = options.getRenderer();
      const liveCanvas = options.getCanvas();
      if (!source || !renderer || !liveCanvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText("Source or renderer not available", 10, 20);
        return;
      }

      // Set canvas size to match source
      canvas.width = source.width;
      canvas.height = source.height;

      // Capture the live WebGL output canvas directly (preserveDrawingBuffer
      // is enabled on the renderer, so toDataURL returns real pixels).
      try {
        const reconDataUrl = renderer.passes.length > 0 ? liveCanvas.toDataURL() : "";
        
        if (!reconDataUrl) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillText("No reconstruction available", 10, 20);
          return;
        }

        const reconImg = new Image();
        reconImg.src = reconDataUrl;
        reconImg.onload = () => {
          // Draw source
          ctx.drawImage(source, 0, 0);
          // Get source image data
          const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Clear and draw reconstruction
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(reconImg, 0, 0);
          // Get reconstruction image data
          const reconData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Create difference image
          const diffData = ctx.createImageData(canvas.width, canvas.height);
          let totalDiff = 0;
          let maxDiff = 0;
          
          for (let i = 0; i < sourceData.data.length; i += 4) {
            const rDiff = Math.abs(sourceData.data[i] - reconData.data[i]);
            const gDiff = Math.abs(sourceData.data[i+1] - reconData.data[i+1]);
            const bDiff = Math.abs(sourceData.data[i+2] - reconData.data[i+2]);
            // Use average diff for grayscale
            const diff = (rDiff + gDiff + bDiff) / 3;
            totalDiff += diff;
            if (diff > maxDiff) maxDiff = diff;
            
            // Heatmap: dark = match (low diff), red = large diff
            // We'll map diff to red intensity
            const intensity = Math.min(255, Math.floor((diff / 255) * 255));
            diffData.data[i] = intensity;     // Red
            diffData.data[i+1] = 0;           // Green
            diffData.data[i+2] = 255 - intensity; // Blue (inverse for heatmap feel)
            diffData.data[i+3] = 255;         // Alpha
          }
          
          // Put difference data
          ctx.putImageData(diffData, 0, 0);
          
          // Optional: show avg/max diff
          const avgDiff = totalDiff / (sourceData.data.length / 4);
          // You could display this somewhere if needed
        };
      } catch (e) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText("Error generating diff map", 10, 20);
        console.error("Diff map error:", e);
      }
    }

    // Update on refresh
    updateDiffMap();
  }

  // Isolate layer: dropdown to temporarily disable other layers
  function renderIsolateLayer(container: HTMLElement, options: ComparisonToolsOptions) {
    const wrapper = document.createElement("div");
    wrapper.className = "isolate-layer-wrapper";
    container.appendChild(wrapper);

    const state = options.getCurrentStack();
    const items = state.items;
    if (items.length === 0) {
      wrapper.textContent = "No layers in stack";
      return;
    }

    // Dropdown
    const label = document.createElement("label");
    label.textContent = "Isolate layer: ";
    label.style.display = "block";
    label.style.marginBottom = "8px";
    wrapper.appendChild(label);

    const select = document.createElement("select");
    select.className = "isolate-select";
    items.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.core} (${item.enabled ? "On" : "Off"})`;
      select.appendChild(option);
    });
    wrapper.appendChild(select);

    // Preview canvas
    const canvas = document.createElement("canvas");
    canvas.className = "isolate-canvas";
    canvas.width = 256;
    canvas.height = 256;
    wrapper.appendChild(canvas);

    // Update preview when selection changes
    async function updateIsolatePreview() {
      const selectedId = select.value;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!selectedId) {
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("Select a layer", canvas.width / 2, canvas.height / 2);
        return;
      }

      // Ask the host app to render ONLY this layer, capture, then restore.
      // The host owns the render loop, so it must drive the temporary state.
      if (!options.onIsolate) {
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("Isolation unsupported", canvas.width / 2, canvas.height / 2);
        return;
      }

      try {
        options.onIsolate(selectedId);
        // Wait two animation frames so the host re-renders with the isolated stack.
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const live = options.getCanvas();
        if (live) {
          ctx.drawImage(live, 0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
        console.error("Isolate error:", e);
      } finally {
        // Always restore the full stack, even on error.
        options.onIsolate(null);
      }
    }

    select.addEventListener("change", updateIsolatePreview);
    // Initial update
    updateIsolatePreview();
  }

  // Helper: update reference image
  function updateReferenceImage(img: HTMLImageElement, source: HTMLCanvasElement | null) {
    if (!source) {
      img.src = "";
      return;
    }
    img.src = source.toDataURL();
  }

  // Helper: update reconstruction image
  function updateReconstructionImage(img: HTMLImageElement, _renderer: Renderer | null) {
    const liveCanvas = options.getCanvas();
    if (!liveCanvas) {
      img.src = "";
      return;
    }
    try {
      // The renderer uses preserveDrawingBuffer: true, so the live WebGL
      // canvas can be snapshotted directly.
      img.src = liveCanvas.toDataURL();
    } catch (e) {
      console.error("Error getting reconstruction image:", e);
      img.src = "";
    }
  }

  // Public methods
  const handle: ComparisonToolsHandle = {
    destroy() {
      if (!isMounted) return;
      isMounted = false;
      overlay?.remove();
      overlay = null;
      modal = null;
      // Cleanup any stored cleanups (like split view drag)
      // In a more complete implementation, we'd track these properly
    },
    refresh() {
      if (!isMounted) return;
      refreshContent();
    },
  };

  return handle;
}