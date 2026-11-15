/**
 * Карточка зоны: статус, показатели, выборка, объяснение оценки.
 * Публичные данные без авторов и точного времени события.
 * Контент выделен отдельно: на десктопе карточка крепится у нижнего края
 * карты, на мобильных тот же контент открывается в нижнем Drawer-е.
 */
import { Alert, Badge, Button, Card, Divider, Group, List, SimpleGrid, Text } from '@mantine/core';
import type { CellSummary } from '@svyaz-est/contracts';
import {
  ENVIRONMENT_LABELS,
  NETWORK_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  reasonText,
} from '../lib/labels';

function formatMetric(value: number | null, digits: number, suffix: string): string {
  return value === null ? '—' : `${value.toFixed(digits)} ${suffix}`;
}

interface ZoneCardProps {
  summary: CellSummary;
  operatorName?: string;
  onClose: () => void;
}

export function ZoneCard({ summary, operatorName, onClose }: ZoneCardProps) {
  return (
    <Card className="zone-card-dock" shadow="md" padding="md" radius="md" withBorder visibleFrom="md">
      <ZoneCardContent summary={summary} operatorName={operatorName} onClose={onClose} />
    </Card>
  );
}

export function ZoneCardContent({
  summary,
  operatorName,
  onClose,
}: Omit<ZoneCardProps, 'onClose'> & { onClose?: () => void }) {
  const profileName =
    summary.filters.profileCode === 'video-call' ? 'Видеозвонок' : 'Базовые задачи';
  const groupText = [
    operatorName ??
      (summary.filters.operatorId === 'unknown'
        ? 'неизвестный оператор'
        : summary.filters.operatorId),
    NETWORK_LABELS[summary.filters.networkType] ?? summary.filters.networkType,
    ENVIRONMENT_LABELS[summary.filters.environment] ?? summary.filters.environment,
  ].join(', ');
  return (
    <>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: STATUS_COLORS[summary.status],
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <Text fw={700}>{STATUS_LABELS[summary.status]}</Text>
        </Group>
        <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
          {summary.cellId}
        </Badge>
      </Group>

      {summary.status === 'insufficient_data' && (
        <Alert color="gray" variant="light" mt="xs">
          Оценки пока нет: данных недостаточно. Ниже — почему.
        </Alert>
      )}

      <SimpleGrid cols={3} mt="md" mb="md">
        <div>
          <Text size="xs" c="dimmed">
            Загрузка
          </Text>
          <Text fw={600}>{formatMetric(summary.metrics.downloadMbps, 1, 'Мбит/с')}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Отдача
          </Text>
          <Text fw={600}>{formatMetric(summary.metrics.uploadMbps, 1, 'Мбит/с')}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Задержка
          </Text>
          <Text fw={600}>{formatMetric(summary.metrics.rttMs, 0, 'мс')}</Text>
        </div>
      </SimpleGrid>

      <Divider my="xs" />
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm">
          Учтено замеров: <b>{summary.sampleCount}</b>
        </Text>
        <Text size="sm">
          Последний замер: <b>{summary.lastMeasurementDate ?? '—'}</b>
        </Text>
        <Text size="sm">
          События ошибок: <b>{summary.complaintCount}</b>
        </Text>
      </Group>

      <Divider my="xs" />
      <Text size="sm" c="dimmed" mb={4}>
        Почему такая оценка ({profileName}, методика {summary.methodologyVersion})
      </Text>
      <List size="sm" spacing={2} withPadding>
        {summary.reasonCodes.map((code) => (
          <List.Item key={code}>{reasonText(code)}</List.Item>
        ))}
      </List>

      <Group justify="space-between" align="flex-end" mt="md" gap="xs">
        <Text size="xs" c="dimmed">
          Группа: {groupText}
        </Text>
        {onClose && (
          <Button variant="light" size="compact-xs" onClick={onClose} style={{ flexShrink: 0 }}>
            Закрыть
          </Button>
        )}
      </Group>
    </>
  );
}
