import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Map as MapLibreMap, Marker, type GeoJSONSource } from 'maplibre-gl';
import type { GeoPoint } from '../lib/areaLocation';
import { circleBounds, mapStyleUrl, OVERVIEW_CAMERA, radiusCircle, toGeoPoint } from '../lib/areaMap';

// The service-area map (MapLibre GL JS, https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)
// rendered inside the area step's DOM screen. It only draws: the business point and
// radius come in as props, and a dropped pin goes back out through onMove.
// With no center it shows the world overview, with no pin and no circle.
export default function AreaMap(props: {
  center: GeoPoint | null;
  radiusKm: number;
  label: string;
  onMove: (point: GeoPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const area = useMapLibre(containerRef, mapStyleUrl(usePrefersDark()), props.onMove);
  const shownOn = useRef<AreaMapHandle | null>(null);

  useEffect(() => {
    if (!area) return;
    // The first frame of a new map jumps into place; later radius or pin changes glide.
    showArea(area, props.center, props.radiusKm, shownOn.current === area);
    shownOn.current = area;
  }, [area, props.center?.lat, props.center?.lng, props.radiusKm]);

  return <div ref={containerRef} className="onk-map" role="region" aria-label={props.label} />;
}

type AreaMapHandle = { map: MapLibreMap; pin: Marker };

const AREA_SOURCE = 'service-area';
const EMPTY_AREA = { type: 'FeatureCollection', features: [] } as const;
// The attribution bar covers the bottom of the map, so the circle sits above it.
const FIT_PADDING = { top: 24, right: 24, bottom: 48, left: 24 };
const DARK_QUERY = '(prefers-color-scheme: dark)';

// One map per style: a theme switch rebuilds it, since setStyle drops the area layers.
// The latest onMove is read through a ref, so a new callback never rebuilds the map.
function useMapLibre(
  containerRef: RefObject<HTMLDivElement | null>,
  styleUrl: string,
  onMove: (point: GeoPoint) => void,
): AreaMapHandle | null {
  const [handle, setHandle] = useState<AreaMapHandle | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const accent = getComputedStyle(container).getPropertyValue('--color-accent').trim();
    const map = new MapLibreMap({ container, style: styleUrl, ...OVERVIEW_CAMERA, attributionControl: { compact: false } });
    const pin = createPin(accent, (point) => onMoveRef.current(point));
    map.on('load', () => {
      addAreaLayers(map, accent);
      setHandle({ map, pin });
    });
    return () => {
      setHandle(null);
      map.remove();
    };
  }, [containerRef, styleUrl]);

  return handle;
}

function showArea({ map, pin }: AreaMapHandle, center: GeoPoint | null, radiusKm: number, animate: boolean): void {
  const source = map.getSource<GeoJSONSource>(AREA_SOURCE);
  if (center === null) {
    pin.remove();
    source?.setData(EMPTY_AREA);
    map.jumpTo(OVERVIEW_CAMERA);
    return;
  }
  pin.setLngLat(center).addTo(map);
  source?.setData(radiusCircle(center, radiusKm));
  map.fitBounds(circleBounds(center, radiusKm), { padding: FIT_PADDING, animate });
}

function createPin(accent: string, onMove: (point: GeoPoint) => void): Marker {
  const pin = new Marker({ color: accent, draggable: true });
  pin.on('dragend', () => onMove(toGeoPoint(pin.getLngLat())));
  return pin;
}

function addAreaLayers(map: MapLibreMap, accent: string): void {
  map.addSource(AREA_SOURCE, { type: 'geojson', data: EMPTY_AREA });
  map.addLayer({ id: 'service-area-fill', type: 'fill', source: AREA_SOURCE, paint: { 'fill-color': accent, 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'service-area-line', type: 'line', source: AREA_SOURCE, paint: { 'line-color': accent, 'line-width': 2 } });
}

// The OS light/dark preference, the same one the Astryx Theme follows in system mode.
// Static rendering has no window, so the first render there is light.
function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setIsDark(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isDark;
}
