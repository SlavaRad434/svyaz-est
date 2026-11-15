/**
 * Сетка квадратов 250×250 м. docs/interfaces.md §3.
 *
 * Демо-допущение (фиксируется для прототипа, пилот и проекция ещё выбираются):
 * локальная равнопромежуточная проекция вокруг центра пилота с поправкой
 * cos(широта центра). Погрешность размера квадрата на местности — доли
 * процента в пределах города, документирована в README.
 */
import type { GeoPoint, GridConfig } from '@svyaz-est/contracts';

const EARTH_RADIUS_M = 6371008.8;

export interface CellRef {
  gridVersion: string;
  column: number;
  row: number;
}

export interface CellPolygon {
  /** Замкнутое кольцо [longitude, latitude], WGS84, порядок GeoJSON. */
  ring: [number, number][];
}

export class GridError extends Error {}

/** cellId = gridVersion:column:row; column/row могут быть отрицательными. */
export function parseCellId(cellId: string): CellRef {
  const parts = cellId.split(':');
  if (parts.length !== 3) {
    throw new GridError(`INVALID_CELL_ID: ${cellId}`);
  }
  const gridVersion = parts[0]!;
  const column = Number.parseInt(parts[1]!, 10);
  const row = Number.parseInt(parts[2]!, 10);
  if (!Number.isInteger(column) || !Number.isInteger(row)) {
    throw new GridError(`INVALID_CELL_ID: ${cellId}`);
  }
  return { gridVersion, column, row };
}

export function formatCellId(ref: CellRef): string {
  return `${ref.gridVersion}:${ref.column}:${ref.row}`;
}

function projectionParams(grid: GridConfig): {
  centerLongitude: number;
  centerLatitude: number;
  metersPerDegreeLat: number;
  metersPerDegreeLon: number;
} {
  const params = grid.projectionParams;
  if (!params || params.type !== 'local-equirectangular') {
    throw new GridError(
      `UNSUPPORTED_PROJECTION: ${grid.projectionDefinition} (демо поддерживает local-equirectangular)`,
    );
  }
  return {
    centerLongitude: params.centerLongitude,
    centerLatitude: params.centerLatitude,
    metersPerDegreeLat: (Math.PI / 180) * EARTH_RADIUS_M,
    metersPerDegreeLon: (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((params.centerLatitude * Math.PI) / 180),
  };
}

function toLocalMeters(point: GeoPoint, grid: GridConfig): { x: number; y: number } {
  const p = projectionParams(grid);
  return {
    x: (point.longitude - p.centerLongitude) * p.metersPerDegreeLon,
    y: (point.latitude - p.centerLatitude) * p.metersPerDegreeLat,
  };
}

function fromLocalMeters(x: number, y: number, grid: GridConfig): GeoPoint {
  const p = projectionParams(grid);
  return {
    longitude: p.centerLongitude + x / p.metersPerDegreeLon,
    latitude: p.centerLatitude + y / p.metersPerDegreeLat,
  };
}

function insideBbox(point: GeoPoint, bbox: [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  return (
    point.longitude >= west &&
    point.longitude < east &&
    point.latitude >= south &&
    point.latitude < north
  );
}

/**
 * Координаты → индексы ячейки без проверки пилотной границы.
 * Сетка формально бесконечна; принадлежность пилоту проверяется отдельно.
 */
export function cellIndexAt(point: GeoPoint, grid: GridConfig): { column: number; row: number } {
  const { x, y } = toLocalMeters(point, grid);
  return {
    column: Math.floor((x - grid.originEasting) / grid.cellSizeMeters),
    row: Math.floor((y - grid.originNorthing) / grid.cellSizeMeters),
  };
}

/**
 * Координаты → ячейка. Вычисление выполняется только на устройстве.
 * Ячейка включает левую/нижнюю границу и исключает правую/верхнюю.
 * Точка вне пилотной границы → null (публикация невозможна).
 */
export function resolveCell(
  point: GeoPoint,
  grid: GridConfig,
): { cellId: string; gridVersion: string } | null {
  if (!insideBbox(point, grid.pilotBoundary)) {
    return null;
  }
  const { column, row } = cellIndexAt(point, grid);
  return {
    cellId: formatCellId({ gridVersion: grid.gridVersion, column, row }),
    gridVersion: grid.gridVersion,
  };
}

/** Геометрия ячейки для карты: замкнутый полигон WGS84. */
export function cellPolygon(cellId: string, grid: GridConfig): CellPolygon {
  const { column, row } = parseCellId(cellId);
  const size = grid.cellSizeMeters;
  const west = grid.originEasting + column * size;
  const south = grid.originNorthing + row * size;
  const east = west + size;
  const north = south + size;
  const sw = fromLocalMeters(west, south, grid);
  const se = fromLocalMeters(east, south, grid);
  const ne = fromLocalMeters(east, north, grid);
  const nw = fromLocalMeters(west, north, grid);
  return {
    ring: [
      [sw.longitude, sw.latitude],
      [se.longitude, se.latitude],
      [ne.longitude, ne.latitude],
      [nw.longitude, nw.latitude],
      [sw.longitude, sw.latitude],
    ],
  };
}

export function cellCenter(cellId: string, grid: GridConfig): GeoPoint {
  const { column, row } = parseCellId(cellId);
  const size = grid.cellSizeMeters;
  const cx = grid.originEasting + (column + 0.5) * size;
  const cy = grid.originNorthing + (row + 0.5) * size;
  return fromLocalMeters(cx, cy, grid);
}

/** Все ячейки, пересекающие пилотную границу (полные квадраты). */
export function pilotCellIds(grid: GridConfig): string[] {
  const [west, south, east, north] = grid.pilotBoundary;
  // Граница пилота — полуинтервал для точек, но по клеткам сохраняются
  // полные квадраты, пересекающие территорию, поэтому правая/верхняя
  // граница входит в диапазон floor без исключающего сдвига.
  const sw = toLocalMeters({ longitude: west, latitude: south }, grid);
  const ne = toLocalMeters({ longitude: east, latitude: north }, grid);
  const colFrom = Math.floor((sw.x - grid.originEasting) / grid.cellSizeMeters);
  const colTo = Math.floor((ne.x - grid.originEasting) / grid.cellSizeMeters);
  const rowFrom = Math.floor((sw.y - grid.originNorthing) / grid.cellSizeMeters);
  const rowTo = Math.floor((ne.y - grid.originNorthing) / grid.cellSizeMeters);
  const ids: string[] = [];
  for (let column = colFrom; column <= colTo; column += 1) {
    for (let row = rowFrom; row <= rowTo; row += 1) {
      ids.push(formatCellId({ gridVersion: grid.gridVersion, column, row }));
    }
  }
  return ids;
}

/** Горизонтальный размер отрезка долготы в метрах проекции сетки. */
export function lonSpanMeters(dLonDeg: number, grid: GridConfig): number {
  return dLonDeg * projectionParams(grid).metersPerDegreeLon;
}

/** Вертикальный размер отрезка широты в метрах проекции сетки. */
export function latSpanMeters(dLatDeg: number, grid: GridConfig): number {
  return dLatDeg * projectionParams(grid).metersPerDegreeLat;
}

/** Копия конфигурации с другим размером квадрата (динамическое окно карты). */
export function withCellSize(grid: GridConfig, cellSizeMeters: number): GridConfig {
  return { ...grid, cellSizeMeters };
}
