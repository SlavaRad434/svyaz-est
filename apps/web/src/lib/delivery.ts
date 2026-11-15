/**
 * Доставка очереди наблюдений (US-12).
 *
 * Одна точка доставки: и авто-повтор при старте приложения, и немедленная
 * отправка после теста идут через flushPendingQueue — с теми же
 * attemptToken и ключом идемпотентности, что сохранены в очереди.
 */
import type { ObservationReceipt } from '@svyaz-est/contracts';
import { demoGateway } from './demo';
import { pendingQueue } from './queue';

export async function flushPendingQueue(
  onReceipt?: (receipt: ObservationReceipt) => void,
): Promise<number> {
  return pendingQueue.deliverAll(async (input, attemptToken, idempotencyKey) => {
    const receipt = await demoGateway.submitObservation(
      input as Parameters<typeof demoGateway.submitObservation>[0],
      attemptToken,
      idempotencyKey,
    );
    onReceipt?.(receipt);
  });
}
