/**
 * Корень приложения: шапка с демо-меню и область контента с прокруткой.
 * При старте доставляются записи, оставшиеся в локальной очереди (US-12):
 * «повтор отправки при открытом приложении» без участия пользователя.
 * В шапке — «Войти» для гостя и «Мои записи» для участника (US-05/10).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Button, Group, Title } from '@mantine/core';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { ModerationPage } from './pages/ModerationPage';
import { MyObservationsPage } from './pages/MyObservationsPage';
import { TestPage } from './pages/TestPage';
import { DemoMenu } from './components/DemoPanel';
import { demoStore } from './lib/demo';
import { flushPendingQueue } from './lib/delivery';

export function App() {
  const role = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );

  useEffect(() => {
    // US-12: повторная доставка сохранённых записей при открытии приложения.
    void flushPendingQueue();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="app-header">
        <Group gap="xs" wrap="nowrap">
          <Title order={4}>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              СвязьЕсть
            </Link>
          </Title>
          <DemoMenu />
        </Group>
        <Group className="app-header__actions" gap="sm" wrap="nowrap">
          <Button component={Link} to="/test" size="compact-md" className="tap-target">
            Запустить тест
          </Button>
          <Button
            component={Link}
            to="/methodology"
            variant="light"
            size="compact-md"
            className="tap-target"
          >
            Методика
          </Button>
          <Button
            component={Link}
            to="/admin"
            variant="light"
            size="compact-md"
            className="tap-target"
          >
            Модерация
          </Button>
          {role === 'guest' ? (
            <Button component={Link} to="/login" size="compact-md" className="tap-target">
              Войти
            </Button>
          ) : (
            <Button component={Link} to="/me" size="compact-md" className="tap-target">
              Мои записи
            </Button>
          )}
        </Group>
      </header>
      <div className="app-content">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/admin" element={<ModerationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/me" element={<MyObservationsPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="*" element={<MapPage />} />
        </Routes>
      </div>
    </div>
  );
}
