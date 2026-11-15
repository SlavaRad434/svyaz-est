/**
 * Панель модерации (US-09): список записей, скрытие и восстановление
 * с обязательной причиной из справочника, журнал решений.
 * Пользователь без роли администратора получает явный отказ (NFR-04).
 * Скрытие и восстановление меняют статус, агрегаты пересчитываются сразу.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type {
  AdminObservation,
  CatalogResponse,
  ModerationActionEntry,
} from '@svyaz-est/contracts';
import { demoGateway, demoStore } from '../lib/demo';

type PagePhase =
  | { name: 'loading' }
  | { name: 'forbidden' }
  | { name: 'ready'; rows: AdminObservation[]; journal: ModerationActionEntry[] }
  | { name: 'error'; message: string };

export function ModerationPage() {
  const role = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );
  const storeVersion = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.snapshotVersion,
  );
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [phase, setPhase] = useState<PagePhase>({ name: 'loading' });
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    demoGateway.getCatalog().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  const reload = useCallback(async () => {
    if (role !== 'admin') {
      setPhase({ name: 'forbidden' });
      return;
    }
    try {
      const [rows, journal] = await Promise.all([
        demoGateway.getAdminObservations(),
        demoGateway.getModerationJournal(),
      ]);
      setPhase({ name: 'ready', rows, journal });
    } catch (error) {
      setPhase({
        name: 'error',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  }, [role]);

  useEffect(() => {
    void reload();
  }, [reload, storeVersion]);

  const moderate = useCallback(
    async (observationId: string, action: 'hide' | 'restore') => {
      if (!reasonCode) {
        setActionError('Выберите причину решения — свободный текст исключён.');
        return;
      }
      setActionError(null);
      setBusyId(observationId);
      try {
        await demoGateway.moderateObservation(observationId, action, reasonCode);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Неизвестная ошибка');
      } finally {
        setBusyId(null);
      }
    },
    [reasonCode],
  );

  if (role !== 'admin') {
    return (
      <Stack p="md" maw={760} gap="md">
        <Title order={3}>Модерация</Title>
        <Alert color="red" title="Доступ запрещён">
          Раздел доступен только администратору. Текущая роль — {role === 'guest' ? 'гость' : 'участник'}.
          Смените роль в демо-меню, чтобы увидеть панель.
        </Alert>
        <div>
          <Link to="/">← К карте</Link>
        </div>
      </Stack>
    );
  }

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Title order={3}>Модерация записей</Title>
        <Badge variant="light" color="orange">
          Демо
        </Badge>
      </Group>

      {phase.name === 'loading' && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Загружаются записи…
          </Text>
        </Group>
      )}

      {phase.name === 'error' && (
        <Alert color="red" title="Ошибка загрузки">
          {phase.message}
        </Alert>
      )}

      {phase.name === 'ready' && (
        <>
          <Card withBorder radius="md" padding="sm">
            <Box maw={420}>
              <Select
                label="Причина решения (обязательна, из справочника)"
                placeholder="Выберите причину"
                data={(catalog?.moderationReasons ?? []).map((reason) => ({
                  value: reason.code,
                  label: reason.label,
                }))}
                value={reasonCode}
                onChange={(value) => {
                  setReasonCode(value);
                  setActionError(null);
                }}
              />
            </Box>
            {actionError && (
              <Text size="sm" c="red" mt={6}>
                {actionError}
              </Text>
            )}
          </Card>

          <Card withBorder radius="md" padding="sm">
            <Table highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ячейка</Table.Th>
                  <Table.Th>Тип</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Автор</Table.Th>
                  <Table.Th>Показатели</Table.Th>
                  <Table.Th>Решение</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {phase.rows.map((row) => (
                  <Table.Tr key={row.id} opacity={row.status === 'hidden' ? 0.55 : 1}>
                    <Table.Td>
                      <Text size="sm">{row.cellId}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {row.kind === 'measurement' ? 'Замер' : 'Событие ошибки'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={row.status === 'hidden' ? 'red' : 'green'}>
                        {row.status === 'hidden' ? 'Скрыта' : 'Видна'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {row.authorKind === 'guest' ? 'гость' : 'участник'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {row.kind === 'measurement'
                          ? `↓ ${row.downloadMbps?.toFixed(1) ?? '—'} · ↑ ${row.uploadMbps?.toFixed(1) ?? '—'} · ${row.rttMs ?? '—'} мс`
                          : 'сбой теста'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {row.status === 'active' ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="red"
                            disabled={!reasonCode || busyId === row.id}
                            onClick={() => void moderate(row.id, 'hide')}
                          >
                            Скрыть
                          </Button>
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="green"
                            disabled={!reasonCode || busyId === row.id}
                            onClick={() => void moderate(row.id, 'restore')}
                          >
                            Восстановить
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {phase.rows.length === 0 && (
              <Text size="sm" c="dimmed" mt="xs">
                Записей нет.
              </Text>
            )}
          </Card>

          <Card withBorder radius="md" padding="sm">
            <Text fw={600} mb="xs">
              Журнал решений
            </Text>
            {phase.journal.length === 0 ? (
              <Text size="sm" c="dimmed">
                Решений пока не было.
              </Text>
            ) : (
              <Stack gap={4}>
                {phase.journal.map((entry) => (
                  <Text key={entry.id} size="sm">
                    {new Date(entry.createdAt).toLocaleString('ru-RU')} —{' '}
                    {entry.action === 'hide' ? 'скрыта' : 'восстановлена'} запись{' '}
                    <b>{entry.observationId.slice(0, 8)}…</b>, причина:{' '}
                    <b>{entry.reasonLabel}</b>
                  </Text>
                ))}
              </Stack>
            )}
          </Card>

          <div>
            <Link to="/">← К карте</Link>
          </div>
        </>
      )}
    </Stack>
  );
}
