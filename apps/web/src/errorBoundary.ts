/**
 * Global error handlers for the LAYERS web app.
 * Installs handlers for window.onerror and unhandledrejection.
 * Shows a dismissible toast for errors and logs to console.
 */

export interface ErrorBoundaryOptions {
  /** Maximum number of toasts to show at once (default: 5) */
  maxToasts?: number;
  /** Whether to log errors to console (default: true) */
  logToConsole?: boolean;
}

/**
 * Install global error handlers.
 * @param opts Configuration options
 */
export function installGlobalErrorHandlers(opts: ErrorBoundaryOptions = {}): void {
  const maxToasts = opts.maxToasts ?? 5;
  const logToConsole = opts.logToConsole ?? true;

  // Track active toasts to avoid duplicates and enforce limit
  const activeToasts = new Map<string, HTMLElement>();

  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector<HTMLDivElement>('#error-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'error-toast-container';
    toastContainer.style.position = 'fixed';
    toastContainer.style.top = '1rem';
    toastContainer.style.right = '1rem';
    toastContainer.style.zIndex = '1000';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '0.5rem';
    document.body.appendChild(toastContainer);
  }

  /**
   * Show a toast message.
   * @param message The error message to show
   */
  function showToast(message: string): void {
    // Deduplicate: if the same message is already showing, skip
    if (activeToasts.has(message)) {
      return;
    }

    // Remove oldest toast if we've reached the limit
    if (activeToasts.size >= maxToasts) {
      const oldestKey = activeToasts.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestToast = activeToasts.get(oldestKey);
        if (oldestToast) {
          oldestToast.remove();
          activeToasts.delete(oldestKey);
        }
      }
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    toast.style.color = '#fff';
    toast.style.padding = '0.75rem 1rem';
    toast.style.borderRadius = '0.25rem';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    toast.style.display = 'flex';
    toast.style.justifyContent = 'space-between';
    toast.style.alignItems = 'center';
    toast.style.gap = '0.75rem';
    toast.style.fontSize = '0.875rem';
    toast.style.maxWidth = '300px';
    toast.style.wordBreak = 'break-word';

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '1rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.lineHeight = '1';
    closeBtn.addEventListener('click', () => {
      toast.remove();
      activeToasts.delete(message);
    });
    toast.appendChild(closeBtn);

    // Add to container and track
    toastContainer?.appendChild(toast);
    activeToasts.set(message, toast);
  }

  /**
   * Handle window.onerror events.
   */
  window.onerror = function (message, source, lineno, colno, error) {
    const msg = `${message} (${source}:${lineno}:${colno})`;
    if (logToConsole) {
      console.error('Global error:', msg, error);
    }
    showToast(`Error: ${msg}`);
    // Returning false lets the browser handle the error normally
    return false;
  };

  /**
   * Handle unhandled promise rejections.
   */
  window.addEventListener('unhandledrejection', function (event) {
    let message = 'Unknown error';
    if (event.reason instanceof Error) {
      message = event.reason.message;
    } else if (typeof event.reason === 'string') {
      message = event.reason;
    } else {
      try {
        message = JSON.stringify(event.reason);
      } catch {
        message = String(event.reason);
      }
    }
    if (logToConsole) {
      console.error('Unhandled promise rejection:', message, event.reason);
    }
    showToast(`Promise error: ${message}`);
    // We don't call event.preventDefault() to let the browser handle it (in dev)
  });
}