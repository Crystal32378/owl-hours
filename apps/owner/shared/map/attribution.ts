// The map credit (OpenFreeMap, OpenMapTiles, OpenStreetMap) shows when the map opens, then
// collapses to MapLibre's (i) button. The OSMF Attribution Guidelines allow collapsing on map
// interaction or "automatically after five seconds", but not starting hidden:
// https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Interactive_maps
// MapLibre's compact control already collapses on drag; this covers maps nobody drags.
export const ATTRIBUTION_VISIBLE_MS = 5000;

type ClassListHolder = { classList: { remove(name: string): unknown } };
type QueryRoot = { querySelector(selector: string): ClassListHolder | null };

export function collapseAttribution(root: QueryRoot): void {
  root.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact")?.classList.remove("maplibregl-compact-show");
}
