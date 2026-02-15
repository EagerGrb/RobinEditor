export type Comparator<T> = (a: T, b: T) => number;

export interface IPriorityQueue<T> {
  push(item: T): void;
  pop(): T | undefined;
  peek(): T | undefined;
  size(): number;
  isEmpty(): boolean;
}

export class PriorityQueue<T> implements IPriorityQueue<T> {
  private _heap: T[] = [];
  private _comparator: Comparator<T>;

  constructor(comparator: Comparator<T>) {
    this._comparator = comparator;
  }

  push(item: T): void {
    this._heap.push(item);
    this._siftUp();
  }

  pop(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    const top = this._heap[0]!;
    const bottom = this._heap.pop();
    if (this._heap.length > 0 && bottom !== undefined) {
      this._heap[0] = bottom;
      this._siftDown();
    }
    return top;
  }

  peek(): T | undefined {
    return this._heap[0];
  }

  size(): number {
    return this._heap.length;
  }

  isEmpty(): boolean {
    return this._heap.length === 0;
  }

  private _siftUp(): void {
    let node = this._heap.length - 1;
    while (node > 0) {
      const parent = Math.floor((node - 1) / 2);
      if (this._comparator(this._heap[node]!, this._heap[parent]!) < 0) {
        this._swap(node, parent);
        node = parent;
      } else {
        break;
      }
    }
  }

  private _siftDown(): void {
    let node = 0;
    while (
      (node * 2 + 1) < this._heap.length
    ) {
      let left = node * 2 + 1;
      let right = node * 2 + 2;
      let smaller = left;

      if (
        right < this._heap.length &&
        this._comparator(this._heap[right]!, this._heap[left]!) < 0
      ) {
        smaller = right;
      }

      if (this._comparator(this._heap[smaller]!, this._heap[node]!) < 0) {
        this._swap(smaller, node);
        node = smaller;
      } else {
        break;
      }
    }
  }

  private _swap(a: number, b: number): void {
    const temp = this._heap[a]!;
    this._heap[a] = this._heap[b]!;
    this._heap[b] = temp;
  }
}
