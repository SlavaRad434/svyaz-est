/**
 * Демо-меню: переключатель роли, имитация разрыва сети (очередь US-12)
 * и служебные демо-действия в поповере у бейджа «Демо» в шапке.
 */
import { Badge, Box, Button, Popover, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState, useSyncExternalStore } from 'react';
import { demoGateway, demoStore } from '../lib/demo';
import { pendingQueue } from '../lib/queue';
import type { DemoRole } from '../demo/DemoStore';

function useDemoRole(): DemoRole {
  return useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );
}

function useQueueLength(): number {
  return useSyncExternalStore(
    (listener) => pendingQueue.subscribe(listener),
    () => pendingQueue.snapshotVersion,
  );
}

const ROLE_HINTS: Record<DemoRole, string> = {
  guest: 'гость (замеры без привязки к аккаунту)',
  member: 'участник',
  admin: 'администратор',
};

export function DemoRoleSwitch() {
  const role = useDemoRole();
  return (
    <SegmentedControl
      size="xs"
      data={[
        { value: 'guest', label: 'Гость' },
        { value: 'member', label: 'Участник' },
        { value: 'admin', label: 'Админ' },
      ]}
      value={role}
      onChange={(value) => demoStore.setRole(value as DemoRole)}
    />
  );
}

/** Счётчик недоставленных записей (US-12). */
function QueueBadge() {
  const pending = useQueueLength();
  if (pending <= 0) {
    return null;
  }
  return (
    <Badge variant="light" color="orange" w="100%">
      В очереди доставки: {pending}
    </Badge>
  );
}

export function DemoMenu() {
  const role = useDemoRole();
  const pending = useQueueLength();
  const [networkDown, setNetworkDown] = useState(demoGateway.failNextSubmit);
  return (
    <Popover width={300} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <UnstyledButton title="Демо-настройки">
          <Badge variant="light" color="orange">
            Демо
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Прототип на демонстрационных данных: измерения симулируются, сервер
            и БД отсутствуют.
          </Text>
          <Box>
            <Text size="xs" fw={600} mb={4}>
              Роль
            </Text>
            <DemoRoleSwitch />
            <Text size="xs" c="dimmed" mt={4}>
              {ROLE_HINTS[role]}
            </Text>
          </Box>
          <Box>
            <Text size="xs" fw={600} mb={4}>
              Сеть (очередь US-12)
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              data={[
                { value: 'up', label: 'Доступна' },
                { value: 'down', label: 'Разрыв' },
              ]}
              value={networkDown ? 'down' : 'up'}
              onChange={(value) => {
                demoGateway.failNextSubmit = value === 'down';
                setNetworkDown(value === 'down');
              }}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {networkDown
                ? 'Следующая отправка упадёт — запись останется в локальной очереди.'
                : 'Отправки проходят; очередь доставляется автоматически.'}
            </Text>
            {pending > 0 && (
              <Button
                size="xs"
                variant="light"
                w="100%"
                onClick={() => {
                  demoGateway.failNextSubmit = false;
                  setNetworkDown(false);
                }}
              >
                Вернуть сеть и подождать доставку ({pending})
              </Button>
            )}
          </Box>
          <Box>
            <Text size="xs" fw={600} mb={4}>
              Демо-данные
            </Text>
            <Button
              size="xs"
              variant="light"
              w="100%"
              onClick={() =>
                demoStore.simulateHistoricalGuests('demo-izh-v1:0:0', 4, 1, new Date())
              }
            >
              Симулировать вчерашние замеры
            </Button>
            <Text size="xs" c="dimmed" mt={4}>
              Добавляет 4 «вчерашних» гостевых замера в центр пилота — пустая
              ячейка получает вторую дату и цвет.
            </Text>
          </Box>
          <QueueBadge />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
