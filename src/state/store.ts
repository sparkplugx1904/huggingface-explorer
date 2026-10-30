// Pub/Sub store sederhana tanpa framework eksternal

type Listener<T> = (value: T) => void;

export class Store<T> {
  private _value: T;
  private _listeners: Set<Listener<T>> = new Set();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  /** Nilai saat ini */
  get value(): T {
    return this._value;
  }

  /**
   * Berlangganan perubahan state.
   * Kembalikan fungsi unsubscribe.
   */
  subscribe(listener: Listener<T>): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Set nilai baru, bisa berupa nilai langsung atau fungsi updater.
   * Notifikasi semua subscriber setelah nilai berubah.
   */
  set(newValue: T | ((prev: T) => T)): void {
    this._value =
      typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(this._value)
        : newValue;
    this._notify();
  }

  /**
   * Update sebagian field — hanya berlaku jika T adalah object.
   * Shallow merge dengan nilai lama.
   */
  update(partial: Partial<T>): void {
    if (typeof this._value !== 'object' || this._value === null || Array.isArray(this._value)) {
      throw new Error('Store.update() hanya berlaku untuk tipe object');
    }
    this._value = { ...this._value, ...partial };
    this._notify();
  }

  private _notify(): void {
    // Snapshot listener agar unsubscribe di dalam handler aman
    for (const listener of [...this._listeners]) {
      listener(this._value);
    }
  }
}
