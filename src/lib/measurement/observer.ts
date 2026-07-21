type ResizeCallback = (entry: ResizeObserverEntry) => void;

class ResizeObserverManager {
  private ro: ResizeObserver | null = null;
  private callbacks: Map<Element, ResizeCallback>;

  constructor() {
    this.callbacks = new Map();
  }

  private getObserver(): ResizeObserver | null {
    if (this.ro) return this.ro;
    if (typeof ResizeObserver === 'undefined') return null;
    this.ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const callback = this.callbacks.get(entry.target);
        if (callback) {
          callback(entry);
        }
      }
    });
    return this.ro;
  }

  observe(element: Element, callback: ResizeCallback) {
    const wasObserved = this.callbacks.has(element);
    this.callbacks.set(element, callback);
    if (!wasObserved) this.getObserver()?.observe(element);
  }

  unobserve(element: Element) {
    this.callbacks.delete(element);
    this.ro?.unobserve(element);
  }

  /**
   * Disconnects the observer and clears all callbacks.
   * Should only be called during testing or hot module reload.
   */
  disconnect() {
    this.ro?.disconnect();
    this.ro = null;
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
