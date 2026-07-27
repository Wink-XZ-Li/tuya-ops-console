import '@testing-library/jest-dom/vitest';

function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

const storage = globalThis.localStorage;
if (
  !storage ||
  typeof storage.getItem !== 'function' ||
  typeof storage.clear !== 'function'
) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorage(),
    configurable: true,
  });
}
