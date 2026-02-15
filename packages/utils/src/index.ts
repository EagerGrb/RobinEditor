/**
 * Generates a UUID v4 string.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for environments where crypto.randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deep clones an object, supporting Date, RegExp, Map, Set, and circular references.
 */
export function deepClone<T>(obj: T, hash = new WeakMap()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (hash.has(obj)) {
    return hash.get(obj);
  }

  if (obj instanceof Date) {
    return new Date(obj) as any;
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj) as any;
  }

  if (obj instanceof Map) {
    const result = new Map();
    hash.set(obj, result);
    obj.forEach((value, key) => {
      result.set(deepClone(key, hash), deepClone(value, hash));
    });
    return result as any;
  }

  if (obj instanceof Set) {
    const result = new Set();
    hash.set(obj, result);
    obj.forEach((value) => {
      result.add(deepClone(value, hash));
    });
    return result as any;
  }

  // Handle Array and Object
  const result: any = Array.isArray(obj) ? [] : {};
  hash.set(obj, result);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = deepClone((obj as any)[key], hash);
    }
  }

  return result as T;
}
