/**
 * Основной экран: карта зон, фильтры, карточка выбранной зоны.
 * Состояния различимы: загрузка / нет наблюдений в группе / ошибка данных /
 * ошибка загрузки карты (в MapCanvas).
 * Пересечения слоёв исключены: баннер резервирует место под легенду справа,
 * карточка зоны на мобильных открывается нижним Drawer-ом, а не стопкой
 * поверх кнопки фильтров.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Drawer, Group, Loader, Text } from '@mantine/core';
import type { Bbox, CatalogResponse, CellMapFeature, CellSummary } from '@svyaz-est/contracts';
import { DEMO_GRID } from '@svyaz-est/domain';
import { demoGateway, demoStore } from '../lib/demo';
import { filtersToQuery, parseQuery, type PeriodDays } from '../lib/filters';
import { FiltersPanel } from '../components/FiltersPanel';
import { Legend, LegendControl } from '../components/Legend';
import { ZoneCard, ZoneCardContent } from '../components/ZoneCard';
import { MapCanvas } from '../map/MapCanvas';
import { useSyncExternalStore } from 'react';

const PILOT_CENTER: [number, number] = [53.2115, 56.8519];

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parseQuery(searchParams), [searchParams]);
  const { filters, periodDays, selectedCellId } = parsed;

  const storeVersion = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.snapshotVersion,
  );

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [features, setFeatures] = useState<CellMapFeature[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CellSummary | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Видимая область: сетка нарезается под окно (≈10 колонок по ширине). */
  const [viewport, setViewport] = useState<Bbox | null>(null);

  useEffect(() => {
    let cancelled = false;
    demoGateway
      .getCatalog()
      .then((value) => {
        if (!cancelled) {
          setCatalog(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataError('Не удалось загрузить справочник');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtersKey = JSON.stringify(filters);
  const viewportKey = viewport ? viewport.map((value) => value.toFixed(6)).join(',') : '';

  useEffect(() => {
    let cancelled = false;
    setDataError(null);
    demoGateway
      .getMapCells(filters, viewport ?? undefined)
      .then((response) => {
        if (!cancelled) {
          setFeatures(response.features);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures([]);
          setDataError('Не удалось загрузить наблюдения');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filtersKey, viewportKey, storeVersion]);

  useEffect(() => {
    if (!selectedCellId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    demoGateway
      .getCellSummary(selectedCellId, filters, viewport ?? undefined)
      .then((value) => {
        if (!cancelled) {
          setSummary(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setDataError('Не удалось загрузить карточку зоны');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCellId, filtersKey, viewportKey, storeVersion]);

  const applyFilters = useCallback(
    (patch: Partial<typeof filters>, period: PeriodDays = periodDays) => {
      const next = { ...filters, ...patch };
      setSearchParams(filtersToQuery(next, period, selectedCellId), { replace: true });
    },
    [filters, periodDays, selectedCellId, setSearchParams],
  );

  const handleCellClick = useCallback(
    (cellId: string) => {
      setSearchParams(filtersToQuery(filters, periodDays, cellId), { replace: true });
    },
    [filters, periodDays, setSearchParams],
  );

  const handleMove = useCallback((bounds: Bbox) => setViewport(bounds), []);

  const closeCard = useCallback(() => {
    setSearchParams(filtersToQuery(filters, periodDays, null), { replace: true });
  }, [filters, periodDays, setSearchParams]);

  const operators =
    catalog?.operators.map((operator) => ({ value: operator.id, label: operator.name })) ?? [];

  const operatorName = summary
    ? (catalog?.operators.find((operator) => operator.id === summary.filters.operatorId)?.name ??
      null)
    : null;

  const noObservations =
    features !== null &&
    features.length > 0 &&
    features.every((feature) => feature.properties.sampleCount === 0);

  const filtersPanel = (onClose?: () => void) => (
    <FiltersPanel
      filters={filters}
      operators={operators}
      periodDays={periodDays}
      onChange={(patch) => applyFilters(patch)}
      onPeriodChange={(days) => applyFilters({}, days)}
      onApply={onClose}
    />
  );

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <aside className="filters-aside">{filtersPanel()}</aside>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapCanvas
          features={features ?? []}
          selectedCellId={selectedCellId}
          onCellClick={handleCellClick}
          center={PILOT_CENTER}
          zoom={14}
          fitBounds={DEMO_GRID.pilotBoundary}
          onMove={handleMove}
        >
          <Legend />
          <LegendControl />
          <div className="map-overlay map-overlay--banner">
            {features === null && !dataError && (
              <Group gap="xs">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Загружаются наблюдения…
                </Text>
              </Group>
            )}
            {dataError && (
              <Alert color="red" title="Ошибка данных">
                {dataError}
                <div>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    mt={6}
                    onClick={() => window.location.reload()}
                  >
                    Повторить
                  </Button>
                </div>
              </Alert>
            )}
            {!dataError && noObservations && (
              <Alert color="blue" title="В выбранной группе нет наблюдений">
                Попробуйте сменить оператора, тип сети или условия — фильтры не
                смешивают группы.
              </Alert>
            )}
          </div>

          {/* Десктоп: карточка у нижнего края карты. */}
          {summary && (
            <ZoneCard summary={summary} operatorName={operatorName ?? undefined} onClose={closeCard} />
          )}
        </MapCanvas>

        {/* Мобильные: карточка зоны — нижний drawer (wireframe: «карточка появляется
            снизу»); кнопка фильтров остаётся на месте, пересечений нет. */}
        <Drawer
          opened={summary !== null}
          onClose={closeCard}
          position="bottom"
          hiddenFrom="md"
          size="auto"
          radius="lg"
          title="Карточка зоны"
          styles={{ header: { paddingBottom: 4 } }}
        >
          {summary && (
            <ZoneCardContent summary={summary} operatorName={operatorName ?? undefined} onClose={closeCard} />
          )}
        </Drawer>
      </div>

      <Drawer
        opened={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        position="right"
        hiddenFrom="md"
        size="auto"
        title="Фильтры"
      >
        {filtersPanel(() => setFiltersOpen(false))}
      </Drawer>

      <Button
        className="map-overlay map-overlay--filters tap-target"
        variant="default"
        onClick={() => setFiltersOpen(true)}
        hiddenFrom="md"
      >
        Фильтры
      </Button>
    </div>
  );
}
