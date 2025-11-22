type ResizeCallback = (entry: ResizeObserverEntry) => void;

class ResizeObserverManager {
  private ro: ResizeObserver;
  private callbacks: Map<Element, ResizeCallback>;

  constructor() {
    this.callbacks = new Map();
    this.ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const callback = this.callbacks.get(entry.target);
        if (callback) {
          callback(entry);
        }
      }
    });
  }

  observe(element: Element, callback: ResizeCallback) {
    this.callbacks.set(element, callback);
    this.ro.observe(element);
  }

  unobserve(element: Element) {
    this.callbacks.delete(element);
    this.ro.unobserve(element);
  }

  /**
   * Disconnects the observer and clears all callbacks.
   * Should only be called during testing or hot module reload.
   */
  disconnect() {
    this.ro.disconnect();
    this.callbacks.clear();
  }
}

export const resizeObserverManager = new ResizeObserverManager();

// Support hot module reload in development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resizeObserverManager.disconnect();
  });
}
