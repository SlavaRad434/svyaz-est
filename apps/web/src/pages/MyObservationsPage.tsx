/**
 * «Мои записи» (US-10): список собственных замеров и событий ошибок,
 * удаление своего вклада и аккаунта через подтверждение.
 * Гостю раздел недоступен — нужен вход (US-05).
 * Чужие записи не показаны; удаление только своих — проверяется в шлюзе.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type { OwnObservation } from '@svyaz-est/contracts';
import { demoGateway, demoStore } from '../lib/demo';

export function MyObservationsPage() {
  const navigate = useNavigate();
  const role = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );
  const storeVersion = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.snapshotVersion,
  );
  const [rows, setRows] = useState<OwnObservation[] | null>(null);
  const [confirmDeleteObservation, setConfirmDeleteObservation] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRows(await demoGateway.getMyObservations());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка');
    }
  }, []);

  useEffect(() => {
    if (role === 'guest') {
      setRows(null);
      return;
    }
    void reload();
  }, [role, storeVersion, reload]);

  const removeObservation = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await demoGateway.deleteObservation(id);
      setNotice('Запись удалена — агрегаты ячеек пересчитаны.');
      setConfirmDeleteObservation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка');
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setBusy(true);
    try {
      await demoGateway.deleteAccount();
      setConfirmDeleteAccount(false);
      setNotice('Аккаунт удалён: записи исключены из активной выдачи, сессия завершена.');
      setTimeout(() => navigate('/'), 1200);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка');
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  if (role === 'guest') {
    return (
      <Stack p="md" maw={640} gap="md">
        <Title order={3}>Мои записи</Title>
        <Alert color="orange" title="Требуется вход">
          История наблюдений привязана к аккаунту. Гость не имеет истории: вход нужен
          только для просмотра своих записей и управления аккаунтом — карта, тест и
          отправка работают и без него.
        </Alert>
        <Group>
          <Button component={Link} to="/login" className="tap-target">
            Войти
          </Button>
          <Button variant="light" component={Link} to="/" className="tap-target">
            К карте
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Title order={3}>Мои записи</Title>
        <Badge variant="light" color="orange">
          Демо
        </Badge>
      </Group>

      {notice && (
        <Alert color="green" title="Готово" withCloseButton onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert color="red" title="Ошибка" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {rows === null ? (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Загружаются записи…
          </Text>
        </Group>
      ) : (
        <Card withBorder radius="md" padding="sm">
          {rows.length === 0 ? (
            <Text size="sm" c="dimmed">
              У аккаунта пока нет записей. Запустите тест — результат появится здесь.
            </Text>
          ) : (
            <Table highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ячейка</Table.Th>
                  <Table.Th>Тип</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Время</Table.Th>
                  <Table.Th>Показатели</Table.Th>
                  <Table.Th> </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
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
                        {new Date(row.occurredAt).toLocaleString('ru-RU')}
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
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="red"
                        onClick={() => setConfirmDeleteObservation(row.id)}
                      >
                        Удалить
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      )}

      <Card withBorder radius="md" padding="sm">
        <Text fw={600} mb="xs">
          Настройки аккаунта
        </Text>
        <Text size="sm" c="dimmed" mb="sm">
          Удаление аккаунта убирает все ваши записи из активной выдачи и завершает
          сессию. Журнал удалений сохраняется: после восстановления резервной копии
          данные не возвращаются.
        </Text>
        <Button
          variant="light"
          color="red"
          className="tap-target"
          onClick={() => setConfirmDeleteAccount(true)}
        >
          Удалить аккаунт
        </Button>
      </Card>

      <Group gap="md">
        <Link to="/">← К карте</Link>
        <Link to="/login">Вход</Link>
      </Group>

      <Modal
        opened={confirmDeleteObservation !== null}
        onClose={() => setConfirmDeleteObservation(null)}
        title="Удалить запись?"
        centered
      >
        <Text size="sm" mb="md">
          Запись будет удалена из активной выдачи, оценка ячейки пересчитается.
        </Text>
        <Group justify="flex-end">
          <Button variant="light" onClick={() => setConfirmDeleteObservation(null)}>
            Отмена
          </Button>
          <Button
            color="red"
            loading={busy}
            onClick={() => confirmDeleteObservation && void removeObservation(confirmDeleteObservation)}
          >
            Удалить
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={confirmDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
        title="Удалить аккаунт?"
        centered
      >
        <Text size="sm" mb="md">
          Будут удалены все ваши записи ({rows?.length ?? 0}) и завершена сессия.
          Действие необратимо: после восстановления резервной копии записи не
          возвращаются.
        </Text>
        <Group justify="flex-end">
          <Button variant="light" onClick={() => setConfirmDeleteAccount(false)}>
            Отмена
          </Button>
          <Button color="red" loading={busy} onClick={() => void deleteAccount()}>
            Подтвердить удаление
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
