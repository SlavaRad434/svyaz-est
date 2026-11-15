/**
 * Локальная очередь недоставленных наблюдений (US-12, NFR-07).
 *
 * Запись сохраняется в хранилище ДО первой попытки отправки; доставка
 * повторяется с теми же attemptToken и ключом идемпотентности — повтор
 * не создаёт дубль (DemoGateway возвращает прежнюю квитанцию).
 * Хранилище подменяется адаптером (GoF Strategy): по умолчанию
 * localStorage в браузере, в тестах — объект в памяти.
 */

export interface PendingDelivery {
  /** Идентификатор записи очереди (не совпадает с id наблюдения). */
  id: string;
  /** Готовый ввод для gateway.submitObservation. */
  input: unknown;
  attemptToken: string;
  idempotencyKey: string;
  enqueuedAt: string;
  attempts: number;
  lastError: string | null;
}

export interface QueueStorageAdapter {
  read(): string | null;
  write(value: string): void;
}

/** Адаптер браузерного localStorage (GoF Strategy). */
export class LocalStorageAdapter implements QueueStorageAdapter {
  constructor(private readonly key = 'svyaz-est:queue:v1') {}

  read(): string | null {
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      // Отказ хранилища (приватный режим, переполнение) трактуем как недоступность.
      return null;
    }
  }

  write(value: string): void {
    try {
      window.localStorage.setItem(this.key, value);
    } catch {
      /* запись невозможна — очередь остаётся только в памяти сеанса */
    }
  }
}

export class InMemoryAdapter implements QueueStorageAdapter {
  private value: string | null = null;

  read(): string | null {
    return this.value;
  }

  write(value: string): void {
    this.value = value;
  }
}

const STORAGE_KEY = 'svyaz-est:queue:v1';

export class PendingQueue {
  private items: PendingDelivery[] = [];
  private readonly adapter: QueueStorageAdapter;
  /** GoF Observer: компоненты подписываются на изменения очереди. */
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(adapter?: QueueStorageAdapter) {
    this.adapter = adapter ?? new LocalStorageAdapter(STORAGE_KEY);
    this.items = this.load();
  }

  /** Подписка на изменения (для useSyncExternalStore). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get snapshotVersion(): number {
    return this.version;
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private load(): PendingDelivery[] {
    const raw = this.adapter.read();
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as PendingDelivery[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Повреждённая запись: очередь начинается пустой, данные не блокируют приложение.
      return [];
    }
  }

  private persist(): void {
    this.adapter.write(JSON.stringify(this.items));
    this.emit();
  }

  list(): readonly PendingDelivery[] {
    return this.items;
  }

  /** Сохранение до первой попытки доставки (US-12: сначала локально, потом сеть). */
  enqueue(entry: Omit<PendingDelivery, 'id' | 'attempts' | 'lastError'>): PendingDelivery {
    const item: PendingDelivery = {
      ...entry,
      id: crypto.randomUUID(),
      attempts: 0,
      lastError: null,
    };
    this.items = [...this.items, item];
    this.persist();
    return item;
  }

  remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.persist();
  }

  /**
   * Одна волна доставки: для каждой записи вызывается deliver с неизменными
   * attemptToken и ключом. Успех удаляет запись, ошибка увеличивает счётчик
   * попыток и сохраняет причину. Возвращает число доставленных записей.
   */
  async deliverAll(
    deliver: (input: unknown, attemptToken: string, idempotencyKey: string) => Promise<void>,
  ): Promise<number> {
    let delivered = 0;
    for (const item of [...this.items]) {
      try {
        await deliver(item.input, item.attemptToken, item.idempotencyKey);
        this.remove(item.id);
        delivered += 1;
      } catch (cause) {
        this.markFailed(item.id, cause instanceof Error ? cause.message : String(cause));
      }
    }
    return delivered;
  }

  markFailed(id: string, error: string): void {
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, attempts: item.attempts + 1, lastError: error } : item,
    );
    this.persist();
  }
}

/** Единственная очередь приложения. */
export const pendingQueue = new PendingQueue();
