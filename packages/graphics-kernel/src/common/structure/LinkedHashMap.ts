export interface ILinkedHashMap<K, V> {
  set(key: K, value: V): void;
  get(key: K): V | undefined;
  delete(key: K): boolean;
  has(key: K): boolean;
  clear(): void;
  forEach(callback: (value: V, key: K) => void): void;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  readonly size: number;
}

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

export class LinkedHashMap<K, V> implements ILinkedHashMap<K, V> {
  private _map: Map<K, Node<K, V>> = new Map();
  private _head: Node<K, V> | null = null;
  private _tail: Node<K, V> | null = null;

  get size(): number {
    return this._map.size;
  }

  set(key: K, value: V): void {
    const existingNode = this._map.get(key);
    if (existingNode) {
      existingNode.value = value;
      return;
    }

    const newNode: Node<K, V> = {
      key,
      value,
      prev: this._tail,
      next: null,
    };

    if (this._tail) {
      this._tail.next = newNode;
    } else {
      this._head = newNode;
    }
    this._tail = newNode;

    this._map.set(key, newNode);
  }

  get(key: K): V | undefined {
    const node = this._map.get(key);
    return node ? node.value : undefined;
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  delete(key: K): boolean {
    const node = this._map.get(key);
    if (!node) {
      return false;
    }

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._tail = node.prev;
    }

    this._map.delete(key);
    return true;
  }

  clear(): void {
    this._map.clear();
    this._head = null;
    this._tail = null;
  }

  forEach(callback: (value: V, key: K) => void): void {
    let current = this._head;
    while (current) {
      callback(current.value, current.key);
      current = current.next;
    }
  }

  *keys(): IterableIterator<K> {
    let current = this._head;
    while (current) {
      yield current.key;
      current = current.next;
    }
  }

  *values(): IterableIterator<V> {
    let current = this._head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
}
