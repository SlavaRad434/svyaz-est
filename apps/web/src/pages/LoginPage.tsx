/**
 * Экран входа (US-05): вход без заполнения анкеты — одна кнопка внешнего
 * провайдера, аккаунт создаётся автоматически. Состояния: ожидание,
 * ошибка провайдера (демо-переключатель), уже выполнен вход (выход).
 * После входа — возврат к карте (в демо нет «исходного действия»).
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Checkbox, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { demoStore } from '../lib/demo';

export function LoginPage() {
  const navigate = useNavigate();
  const role = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );
  const [phase, setPhase] = useState<'idle' | 'waiting'>('idle');
  const [simulateError, setSimulateError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    setPhase('waiting');
    setError(null);
    // Демо-провайдер: задержка имитирует редирект и подтверждение.
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (simulateError) {
      setPhase('idle');
      setError('Провайдер входа недоступен. Повторите попытку — анкета не потребуется.');
      return;
    }
    demoStore.setRole('member');
    setPhase('idle');
    navigate('/');
  }, [navigate, simulateError]);

  const logout = useCallback(() => {
    // FR-05.2: выход завершает сессию — операции аккаунта становятся недоступны.
    demoStore.setRole('guest');
  }, []);

  const loggedIn = role !== 'guest';

  return (
    <Stack p="md" maw={560} gap="md">
      <Group justify="space-between">
        <Title order={3}>Вход</Title>
        <Text size="sm" c="dimmed">
          Роль: {loggedIn ? (role === 'admin' ? 'администратор' : 'участник') : 'гость'}
        </Text>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          {loggedIn ? (
            <>
              <Alert color="green" title="Вы вошли">
                История наблюдений и управление данными аккаунта доступны в разделе
                «Мои записи».
              </Alert>
              <Group>
                <Button component={Link} to="/me" className="tap-target">
                  Мои записи
                </Button>
                <Button variant="light" color="red" onClick={logout} className="tap-target">
                  Выйти
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                После выхода старая сессия не позволяет операции аккаунта; новый
                гостевой тест доступен без входа.
              </Text>
            </>
          ) : (
            <>
              <Text size="sm">
                Аккаунт создаётся автоматически при первом входе — никакой анкеты нет.
                Гостю вход не требуется: карта, тест и отправка наблюдений работают
                без него.
              </Text>
              <Button
                onClick={() => void login()}
                loading={phase === 'waiting'}
                className="tap-target"
              >
                {phase === 'waiting' ? (
                  <Group gap="xs">
                    <Loader size="xs" color="white" />
                    <span>Переходим к провайдеру…</span>
                  </Group>
                ) : (
                  'Продолжить через провайдера'
                )}
              </Button>
              <Checkbox
                size="xs"
                label="Имитировать ошибку провайдера (демонстрация состояния ошибки)"
                checked={simulateError}
                onChange={(event) => setSimulateError(event.currentTarget.checked)}
              />
              {error && (
                <Alert color="red" title="Не удалось войти">
                  {error}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Card>

      <Group gap="md">
        <Link to="/">← К карте</Link>
        {loggedIn && <Link to="/me">Мои записи</Link>}
      </Group>
    </Stack>
  );
}
