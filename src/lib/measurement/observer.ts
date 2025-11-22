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
}

export const resizeObserverManager = new ResizeObserverManager();
