/**
 * Легенда карты: цвет всегда сопровождается текстом.
 * На десктопе — постоянная карточка; на мобильных — компактный поповер,
 * чтобы баннер уведомлений не пересекался с легендой.
 */
import { Button, Card, List, Popover, Text } from '@mantine/core';
import type { CellStatus } from '@svyaz-est/contracts';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/labels';

const ORDER: CellStatus[] = ['green', 'yellow', 'red', 'insufficient_data'];

export function LegendList() {
  return (
    <List size="xs" spacing={4} listStyleType="none">
      {ORDER.map((status) => (
        <List.Item
          key={status}
          icon={
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: STATUS_COLORS[status],
              }}
            />
          }
        >
          {STATUS_LABELS[status]}
        </List.Item>
      ))}
    </List>
  );
}

export function Legend() {
  return (
    <Card
      className="map-overlay map-overlay--legend"
      shadow="sm"
      padding="xs"
      radius="md"
      withBorder
      visibleFrom="md"
    >
      <Text size="xs" fw={600} mb={2}>
        Легенда
      </Text>
      <LegendList />
    </Card>
  );
}

export function LegendControl() {
  return (
    <Popover position="top-end" withArrow shadow="md">
      <Popover.Target>
        <Button
          className="map-overlay map-overlay--legend"
          variant="default"
          size="compact-xs"
          hiddenFrom="md"
        >
          Легенда
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="xs" fw={600} mb={4}>
          Легенда
        </Text>
        <LegendList />
      </Popover.Dropdown>
    </Popover>
  );
}
