/**
 * Корень приложения: шапка с демо-меню и область контента с прокруткой.
 * Футера нет: демо-действия переехали в поповер бейджа «Демо».
 */
import { Link, Route, Routes } from 'react-router-dom';
import { Button, Group, Title } from '@mantine/core';
import { MapPage } from './pages/MapPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { TestPage } from './pages/TestPage';
import { DemoMenu } from './components/DemoPanel';

export function App() {
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
        </Group>
      </header>
      <div className="app-content">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="*" element={<MapPage />} />
        </Routes>
      </div>
    </div>
  );
}
