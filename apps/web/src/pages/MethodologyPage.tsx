/**
 * Методика оценки: единый источник параметров — packages/domain.
 * Значения остаются гипотезами до полевой калибровки.
 */
import { Card, Divider, Group, List, Stack, Table, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { DEFAULT_METHODOLOGY } from '@svyaz-est/domain';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/labels';
import type { CellStatus } from '@svyaz-est/contracts';

export function MethodologyPage() {
  const config = DEFAULT_METHODOLOGY;
  return (
    <Stack p="md" maw={760} gap="md">
      <Group justify="space-between">
        <Title order={3}>Методика оценки</Title>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Text fw={600}>Как считается оценка ячейки</Text>
          <List withPadding spacing={4}>
            <List.Item>
              Окно учёта — {config.windowDays} дней. Вес замера{' '}
              2<sup>-возраст/{config.halfLifeDays}</sup>: свежие замеры важнее.
            </List.Item>
            <List.Item>
              В группу входят только записи выбранного оператора, типа сети и условий;
              группы не смешиваются.
            </List.Item>
            <List.Item>
              Для мобильного рейтинга нужны подтверждённый мобильный транспорт, известный
              оператор и отсутствие обнаруженного VPN. Записи с неизвестными
              метаданными исключаются с указанием причины.
            </List.Item>
            <List.Item>
              Один автор — один учитываемый замер в сутки (последний). Гостевые замеры
              участвуют в цвете наравне с остальными; один итог на гостевую попытку.
            </List.Item>
            <List.Item>
              Достаточность: не менее {config.minSamples} замеров из разных тестовых
              сессий минимум за {config.minDates} даты. Иначе — серый статус.
            </List.Item>
            <List.Item>
              Цвет — взвешенная доля замеров, прошедших профиль задачи: зелёный от{' '}
              {Math.round(config.greenShare * 100)}%, жёлтый от{' '}
              {Math.round(config.yellowShare * 100)}%, красный ниже.
            </List.Item>
            <List.Item>
              События ошибок учитываются отдельным счётчиком и не превращаются в нулевые
              скорости.
            </List.Item>
          </List>
        </Stack>
      </Card>

      <Card withBorder radius="md" shadow="sm">
        <Text fw={600} mb="xs">
          Профили задач
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Профиль</Table.Th>
              <Table.Th>Загрузка</Table.Th>
              <Table.Th>Отдача</Table.Th>
              <Table.Th>Задержка</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.values(config.profiles).map((profile) => (
              <Table.Tr key={profile.name}>
                <Table.Td>{profile.name}</Table.Td>
                <Table.Td>≥ {profile.minDownloadMbps} Мбит/с</Table.Td>
                <Table.Td>≥ {profile.minUploadMbps} Мбит/с</Table.Td>
                <Table.Td>≤ {profile.maxRttMs} мс</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder radius="md" shadow="sm">
        <Text fw={600} mb="xs">
          Цвета статусов
        </Text>
        <List withPadding spacing={4} listStyleType="none" center>
          {(['green', 'yellow', 'red', 'insufficient_data'] as CellStatus[]).map((status) => (
            <List.Item
              key={status}
              icon={
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
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
        <Divider my="sm" />
        <Text size="sm" c="dimmed">
          Версия методики: {config.methodologyVersion}. Красный статус не означает
          доказанное отсутствие сети — только низкую долю прошедших профиль замеров.
        </Text>
      </Card>

      <div>
        <Link to="/">← Назад к карте</Link>
      </div>
    </Stack>
  );
}
