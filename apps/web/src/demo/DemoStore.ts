/**
 * Демонстрационное хранилище наблюдений в памяти.
 * Изолировано от реальных данных, доступно только демо-адаптеру.
 */
import type { EvaluationObservation } from '@svyaz-est/domain';

export type DemoRole = 'guest' | 'member' | 'admin';

/** Демо-участник: один аккаунт для ролей member и admin. */
export const DEMO_MEMBER_ID = '00000000-0000-4000-8000-00000000mem1'.slice(0, 36);

export class DemoStore {
  private observations: EvaluationObservation[] = [];
  private listeners = new Set<() => void>();
  private roleValue: DemoRole = 'guest';
  private version = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.observations = [];
    this.version += 1;
    this.emit();
  }

  get role(): DemoRole {
    return this.roleValue;
  }

  setRole(role: DemoRole): void {
    this.roleValue = role;
    this.emit();
  }

  /** Автор текущей роли: гость публикует без автора. */
  get currentAuthorId(): string | null {
    return this.roleValue === 'guest' ? null : DEMO_MEMBER_ID;
  }

  get snapshotVersion(): number {
    return this.version;
  }

  list(): readonly EvaluationObservation[] {
    return this.observations;
  }

  add(observation: EvaluationObservation): void {
    this.observations = [...this.observations, observation];
    this.version += 1;
    this.emit();
  }

  /** Массовая вставка (демо-сид): одна копия массива и одно уведомление. */
  addAll(observations: readonly EvaluationObservation[]): void {
    if (observations.length === 0) {
      return;
    }
    this.observations = [...this.observations, ...observations];
    this.version += 1;
    this.emit();
  }

  /** Демо-модерация: скрыть/восстановить запись по id. */
  setStatus(id: string, status: 'active' | 'hidden'): boolean {
    const index = this.observations.findIndex((o) => o.id === id);
    if (index === -1) {
      return false;
    }
    const next = [...this.observations];
    next[index] = { ...next[index]!, status };
    this.observations = next;
    this.version += 1;
    this.emit();
    return true;
  }

  /** Демо-помощник: «вчерашние» гостевые замеры в ячейку (для быстрой окраски). */
  simulateHistoricalGuests(cellId: string, count: number, daysAgo: number, now: Date): void {
    for (let i = 0; i < count; i += 1) {
      const suffix = `${Date.now()}-${i}-${daysAgo}`;
      this.add({
        id: `00000000-0000-4000-8000-h${suffix}`.slice(0, 36),
        kind: 'measurement',
        attemptId: `00000000-0000-4000-8000-a${suffix}`.slice(0, 36),
        testSessionId: `00000000-0000-4000-8000-s${suffix}`.slice(0, 36),
        authorId: null,
        cellId,
        occurredAt: new Date(now.getTime() - daysAgo * 86_400_000 - i * 60_000).toISOString(),
        status: 'active',
        operatorId: 'operator-mts',
        networkType: '4g',
        transport: 'cellular',
        vpn: 'not-detected',
        environment: 'outdoor',
        metrics: { downloadMbps: 22, uploadMbps: 8.5, rttMs: 58 },
      });
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
