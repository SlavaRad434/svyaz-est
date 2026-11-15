/**
 * Холст карты: Leaflet + OpenStreetMap, полигоны ячеек поверх подложки.
 *
 * Полигоны строятся из GeoJSON собственных модулей — картографическая
 * библиотека не участвует в расчёте цвета и не получает точных координат
 * замеров.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader, Text } from '@mantine/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Bbox, CellMapFeature } from '@svyaz-est/contracts';
import { STATUS_COLORS } from '../lib/labels';

interface MapCanvasProps {
  features: CellMapFeature[];
  selectedCellId: string | null;
  onCellClick: (cellId: string) => void;
  center: [number, number];
  zoom: number;
  /** Границы пилота [west, south, east, north] — вписать территорию при старте. */
  fitBounds?: Bbox;
  /** Видимая область изменилась: пересчитать динамическую сетку. */
  onMove?: (bounds: Bbox) => void;
  children?: ReactNode;
}

interface MapHandle {
  destroy: () => void;
  update: (features: CellMapFeature[], selectedCellId: string | null) => void;
}

function createLeafletMap(container: HTMLElement, props: MapCanvasProps): MapHandle {
  // Canvas-рендерер: полное окно полигонов перерисовывается быстро.
  const map = L.map(container, { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  // Атрибуция данных OSM обязательна по лицензии; префикс библиотеки не нужен.
  map.attributionControl.setPrefix(false);

  if (props.fitBounds) {
    const [west, south, east, north] = props.fitBounds;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [10, 10] },
    );
  } else {
    map.setView(props.center, props.zoom);
  }

  let polygons: L.Polygon[] = [];
  const redraw = (features: CellMapFeature[], selectedCellId: string | null) => {
    for (const polygon of polygons) {
      polygon.remove();
    }
    polygons = features.map((feature) => {
      const color = STATUS_COLORS[feature.properties.status];
      const selected = feature.properties.cellId === selectedCellId;
      // GeoJSON-порядок [lon, lat] → Leaflet-порядок [lat, lon].
      const latlngs = feature.geometry.coordinates[0]!.map(([lon, lat]) => [lat, lon] as [number, number]);
      return L.polygon(latlngs, {
        color: selected ? '#1f5fd0' : color,
        weight: selected ? 3 : 1,
        fillColor: color,
        fillOpacity: 0.55,
      })
        .addTo(map)
        .on('click', () => props.onCellClick(feature.properties.cellId));
    });
  };

  redraw(props.features, props.selectedCellId);

  if (props.onMove) {
    const report = () => {
      const bounds = map.getBounds();
      props.onMove?.([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    };
    map.on('moveend zoomend', report);
    // Начальная область после fitBounds.
    setTimeout(report, 0);
  }

  return {
    destroy: () => map.remove(),
    update: redraw,
  };
}

export function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    mapRef.current = createLeafletMap(containerRef.current, propsRef.current);
    setReady(true);
    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.update(props.features, props.selectedCellId);
  }, [props.features, props.selectedCellId, ready]);

  return (
    <div className="map-container">
      <div ref={containerRef} className="map-canvas" />
      {!ready && (
        <div className="map-overlay map-overlay--banner">
          <Text c="dimmed" size="sm">
            Загружается карта…
          </Text>
          <Loader size="sm" mt={4} />
        </div>
      )}
      {props.children}
    </div>
  );
}
