import { describe, expect, it } from 'vitest';
import { DEMO_GRID } from './demo-grid';
import {
  cellCenter,
  cellIndexAt,
  cellPolygon,
  formatCellId,
  parseCellId,
  pilotCellIds,
  resolveCell,
} from './grid';

type GeoPoint = { longitude: number; latitude: number };
const CENTER: GeoPoint = {
  longitude: DEMO_GRID.projectionParams!.centerLongitude,
  latitude: DEMO_GRID.projectionParams!.centerLatitude,
};
const VERSION = DEMO_GRID.gridVersion;

describe('resolveCell', () => {
  it('центр пилота попадает в ячейку 0:0', () => {
    expect(resolveCell(CENTER, DEMO_GRID)).toEqual({
      cellId: `${VERSION}:0:0`,
      gridVersion: VERSION,
    });
  });

  it('точка юго-западнее центра даёт отрицательные индексы', () => {
    const result = resolveCell(
      { longitude: CENTER.longitude - 0.001, latitude: CENTER.latitude - 0.001 },
      DEMO_GRID,
    );
    expect(result?.cellId).toMatch(new RegExp(`^${VERSION}:-\\d+:-\\d+$`));
  });

  it('левая/нижняя граница ячейки включается, правая/верхняя исключается', () => {
    const sizeLon =
      250 / ((Math.PI / 180) * 6371008.8 * Math.cos((CENTER.latitude * Math.PI) / 180));
    const onLeft = resolveCell(
      { longitude: CENTER.longitude + sizeLon, latitude: CENTER.latitude },
      DEMO_GRID,
    );
    expect(onLeft?.cellId).toBe(`${VERSION}:1:0`);
    const justBeforeRight = resolveCell(
      { longitude: CENTER.longitude + 2 * sizeLon - sizeLon / 1000, latitude: CENTER.latitude },
      DEMO_GRID,
    );
    expect(justBeforeRight?.cellId).toBe(`${VERSION}:1:0`);
    const onRight = resolveCell(
      // Крошечный сдвиг вправо от границы: числа с плавающей точкой не дают
      // точного 500 м, floor должен уступить в столбец 2.
      { longitude: CENTER.longitude + 2 * sizeLon * (1 + 1e-9), latitude: CENTER.latitude },
      DEMO_GRID,
    );
    expect(onRight?.cellId).toBe(`${VERSION}:2:0`);
  });

  it('точка вне пилотной границы не публикуется: null', () => {
    expect(
      resolveCell({ longitude: CENTER.longitude - 10, latitude: CENTER.latitude - 10 }, DEMO_GRID),
    ).toBeNull();
  });

  it('cellIndexAt считает индексы и вне пилота, resolveCell — нет', () => {
    const outside: GeoPoint = { longitude: CENTER.longitude + 5, latitude: CENTER.latitude };
    expect(resolveCell(outside, DEMO_GRID)).toBeNull();
    const { column } = cellIndexAt(outside, DEMO_GRID);
    expect(column).toBeGreaterThan(0);
  });

  it('западная граница пилота входит, восточная — нет', () => {
    const [west, south, east, north] = DEMO_GRID.pilotBoundary;
    expect(resolveCell({ longitude: west, latitude: south }, DEMO_GRID)).not.toBeNull();
    expect(resolveCell({ longitude: east, latitude: north }, DEMO_GRID)).toBeNull();
    expect(
      resolveCell({ longitude: east - 0.0001, latitude: north - 0.0001 }, DEMO_GRID),
    ).not.toBeNull();
  });
});

describe('cellPolygon / cellCenter', () => {
  it('кольцо замкнуто, порядок координат [longitude, latitude]', () => {
    const { ring } = cellPolygon(`${VERSION}:0:0`, DEMO_GRID);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    for (const [lon, lat] of ring) {
      expect(lon).toBeGreaterThan(CENTER.longitude - 1);
      expect(lon).toBeLessThan(CENTER.longitude + 1);
      expect(lat).toBeGreaterThan(CENTER.latitude - 1);
      expect(lat).toBeLessThan(CENTER.latitude + 1);
    }
  });

  it('центр ячейки резолвится обратно в тот же cellId', () => {
    // Ячейки внутри пилотной границы.
    for (const cellId of [`${VERSION}:0:0`, `${VERSION}:-2:1`, `${VERSION}:3:-2`]) {
      const center = cellCenter(cellId, DEMO_GRID);
      expect(resolveCell(center, DEMO_GRID)?.cellId).toBe(cellId);
    }
  });
});

describe('parseCellId / formatCellId', () => {
  it('обратимы, включая отрицательные индексы', () => {
    const ref = { gridVersion: VERSION, column: -12, row: 34 };
    expect(parseCellId(formatCellId(ref))).toEqual(ref);
  });

  it('отклоняют некорректные идентификаторы', () => {
    expect(() => parseCellId('demo:1')).toThrow();
    expect(() => parseCellId('demo:a:b')).toThrow();
    expect(() => parseCellId('demo:1:2:3')).toThrow();
  });
});

describe('pilotCellIds', () => {
  it('возвращает сетку полных квадратов на всю границу пилота', () => {
    const ids = pilotCellIds(DEMO_GRID);
    // 8 км / 250 м = 32 столбца и строки; погрешность пересчёта градусов
    // в метры может добавить по столбцу/строке с каждой стороны (floor
    // на отрицательной границе).
    expect(ids.length).toBeGreaterThanOrEqual(32 * 32);
    expect(ids.length).toBeLessThanOrEqual(33 * 33);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
