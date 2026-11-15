/**
 * Панель фильтров: оператор, тип сети, условия, период, профиль задачи.
 * Единое состояние для карты и карточки; применение мгновенное.
 * onApply — необязательная кнопка «Готово» для закрытия drawer-а на мобильных.
 */
import { Button, SegmentedControl, Select, Stack, Title } from '@mantine/core';
import type { CellFilters } from '@svyaz-est/contracts';
import { PERIOD_PRESETS, type PeriodDays } from '../lib/filters';

interface FiltersPanelProps {
  filters: CellFilters;
  operators: { value: string; label: string }[];
  onChange: (patch: Partial<CellFilters>) => void;
  onPeriodChange: (days: PeriodDays) => void;
  periodDays: PeriodDays;
  onApply?: () => void;
}

const NETWORK_OPTIONS = [
  { value: '4g', label: '4G' },
  { value: '5g', label: '5G' },
  { value: '3g', label: '3G' },
  { value: '2g', label: '2G' },
  { value: 'unknown', label: 'Неизвестно' },
];

const ENVIRONMENT_OPTIONS = [
  { value: 'outdoor', label: 'На улице' },
  { value: 'indoor', label: 'В помещении' },
  { value: 'unknown', label: 'Неизвестно' },
];

const PERIOD_OPTIONS = PERIOD_PRESETS.map((days) => ({
  value: String(days),
  label: `Последние ${days} дней`,
}));

export function FiltersPanel({
  filters,
  operators,
  onChange,
  onPeriodChange,
  periodDays,
  onApply,
}: FiltersPanelProps) {
  return (
    <Stack gap="md">
      <Title order={4}>Фильтры</Title>
      <Select
        label="Оператор"
        data={[...operators, { value: 'unknown', label: 'Неизвестный оператор' }]}
        value={filters.operatorId}
        onChange={(value) => value && onChange({ operatorId: value })}
        allowDeselect={false}
      />
      <Select
        label="Тип сети"
        data={NETWORK_OPTIONS}
        value={filters.networkType}
        onChange={(value) => value && onChange({ networkType: value as CellFilters['networkType'] })}
        allowDeselect={false}
      />
      <Select
        label="Условия"
        data={ENVIRONMENT_OPTIONS}
        value={filters.environment}
        onChange={(value) => value && onChange({ environment: value as CellFilters['environment'] })}
        allowDeselect={false}
      />
      <Select
        label="Период"
        data={PERIOD_OPTIONS}
        value={String(periodDays)}
        onChange={(value) => value && onPeriodChange(Number(value) as PeriodDays)}
        allowDeselect={false}
      />
      <div>
        <SegmentedControl
          fullWidth
          data={[
            { value: 'basic', label: 'Базовые задачи' },
            { value: 'video-call', label: 'Видеозвонок' },
          ]}
          value={filters.profileCode}
          onChange={(value) => onChange({ profileCode: value as CellFilters['profileCode'] })}
        />
      </div>
      {onApply && (
        <Button variant="light" onClick={onApply} className="tap-target">
          Готово
        </Button>
      )}
    </Stack>
  );
}
