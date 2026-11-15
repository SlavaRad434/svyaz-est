/**
 * Демо-меню: переключатель роли и служебные демо-действия в поповере
 * у бейджа «Демо» в шапке. Явно обозначает демонстрационный режим.
 */
import { Badge, Box, Button, Popover, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import { useSyncExternalStore } from 'react';
import { demoStore } from '../lib/demo';
import type { DemoRole } from '../demo/DemoStore';

function useDemoRole(): DemoRole {
  return useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
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

export function DemoMenu() {
  const role = useDemoRole();
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
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
