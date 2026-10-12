import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../store/useApp';
import { computeStyle } from '../lib/style';
import { cultureLabel } from '../data/constants';
import { fmtHa } from '../lib/format';
import type { Parcel } from '../types';

const MADAGASCAR: L.LatLngBoundsExpression = [[-25.8, 43.0], [-11.8, 50.7]];
const PILOT: L.LatLngBoundsExpression = [[-21.1, 46.2], [-17.2, 49.0]];
const TILES = {
  plan: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© contributeurs OpenStreetMap' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
};

export default function MapView({ baseIds }: { baseIds: Set<string> }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tile = useRef<L.TileLayer | null>(null);
  const parcelLayers = useRef(new Map<string, L.Polygon>());
  const parcelGroup = useRef(L.layerGroup());
  const communeGroup = useRef(L.layerGroup());
  const regionGroup = useRef(L.layerGroup());
  const zoneGroup = useRef(L.layerGroup());
  const draftGroup = useRef(L.layerGroup());
  const tooltip = useRef(L.tooltip({ sticky: true, direction: 'top', className: 'ptip', offset: [0, -4] }));
  const onMap = useRef(new Set<string>());

  const parcels = useApp((s) => s.parcels);
  const communes = useApp((s) => s.communes);
  const regions = useApp((s) => s.regions);
  const f = useApp((s) => s.filters);
  const colors = useApp((s) => s.colors);
  const threshold = useApp((s) => s.threshold);
  const selectedId = useApp((s) => s.selectedId);
  const basemap = useApp((s) => s.basemap);
  const showCoverage = useApp((s) => s.showCoverage);
  const fly = useApp((s) => s.fly);
  const drawing = useApp((s) => s.drawing);
  const draft = useApp((s) => s.draft);
  const zone = useApp((s) => s.zone);

  const latest = useRef({ parcels: new Map<string, Parcel>(), seasonId: f.seasonId, colors, drawing });
  latest.current.seasonId = f.seasonId;
  latest.current.colors = colors;
  latest.current.drawing = drawing;

  // --- Montage de la carte
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: false, minZoom: 5, maxZoom: 18, zoomSnap: 0.5 });
    m.fitBounds(PILOT, { padding: [10, 10] });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(m);
    L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(m);
    regionGroup.current.addTo(m);
    parcelGroup.current.addTo(m);
    zoneGroup.current.addTo(m);
    draftGroup.current.addTo(m);
    map.current = m;
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (latest.current.drawing) useApp.getState().addDraftPoint([e.latlng.lat, e.latlng.lng]);
    });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; parcelLayers.current.clear(); onMap.current.clear(); };
  }, []);

  // --- Fond de carte
  useEffect(() => {
    const m = map.current; if (!m) return;
    tile.current?.remove();
    tile.current = L.tileLayer(TILES[basemap].url, { attribution: TILES[basemap].attr, maxZoom: 18 }).addTo(m);
    tile.current.bringToBack();
  }, [basemap]);

  // --- Régions + couverture des communes
  useEffect(() => {
    regionGroup.current.clearLayers();
    for (const r of regions) {
      L.polygon(r.outline, { color: '#12262B', weight: 1.5, fill: false, opacity: 0.55, interactive: false }).addTo(regionGroup.current);
    }
    communeGroup.current.clearLayers();
    for (const c of communes) {
      const style: L.PathOptions =
        c.coverage === 'analysee' ? { color: '#0F7F86', weight: 1, fillColor: '#0F7F86', fillOpacity: 0.05 }
        : c.coverage === 'partielle' ? { color: '#C98A00', weight: 1.6, dashArray: '6 4', fillColor: '#F2B84B', fillOpacity: 0.14 }
        : { color: '#5B6770', weight: 1.4, dashArray: '2 5', fillColor: '#5B6770', fillOpacity: 0.25 };
      const lbl = c.coverage === 'analysee' ? 'Analysée' : c.coverage === 'partielle' ? 'Couverture partielle (nuages)' : 'Aucune donnée — non analysée';
      L.polygon(c.outline, style)
        .bindTooltip(`<b>${c.name}</b><br/>${lbl}<br/>Image : ${c.imageDate ?? '—'} · nuages ${Math.round(c.cloudCover * 100)} %`, { sticky: true, className: 'ptip' })
        .addTo(communeGroup.current);
    }
  }, [regions, communes]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    if (showCoverage) { communeGroup.current.addTo(m); }
    else communeGroup.current.remove();
    // Les parcelles doivent rester au-dessus des communes
    parcelLayers.current.forEach((l) => l.bringToFront());
  }, [showCoverage, communes]);

  // --- Création des polygones de parcelles (une seule fois par id)
  useEffect(() => {
    const idx = new Map<string, Parcel>();
    for (const p of parcels) idx.set(p.id, p);
    latest.current.parcels = idx;
    for (const p of parcels) {
      if (parcelLayers.current.has(p.id)) continue;
      const poly = L.polygon(p.coords, { weight: 1, smoothFactor: 1 });
      poly.on('click', () => { if (!latest.current.drawing) useApp.getState().select(p.id); });
      poly.on('mouseover', (e: L.LeafletMouseEvent) => {
        const cur = latest.current.parcels.get(p.id)!;
        const r = cur.results[latest.current.seasonId];
        if (!r || !map.current) return;
        tooltip.current.setLatLng(e.latlng)
          .setContent(`<b>${cur.id}</b><br/>${cultureLabel(r.culture)} · ${Math.round(r.confidence * 100)} %<br/>${fmtHa(cur.areaHa)}`)
          .addTo(map.current);
      });
      poly.on('mouseout', () => { tooltip.current.remove(); });
      parcelLayers.current.set(p.id, poly);
    }
  }, [parcels]);

  // --- Restylage : filtres, couleurs, sélection (aucun recalcul IA)
  useEffect(() => {
    const ctx = { colors, threshold, mode: f.mode, cultures: new Set(f.cultures), othersStyle: f.othersStyle };
    for (const p of parcels) {
      const layer = parcelLayers.current.get(p.id);
      if (!layer) continue;
      const r = p.results[f.seasonId];
      const wanted = !!r && baseIds.has(p.id);
      if (!wanted) {
        if (onMap.current.has(p.id)) { parcelGroup.current.removeLayer(layer); onMap.current.delete(p.id); }
        continue;
      }
      const { visible, options } = computeStyle(r, ctx, p.id === selectedId);
      if (!visible) {
        if (onMap.current.has(p.id)) { parcelGroup.current.removeLayer(layer); onMap.current.delete(p.id); }
        continue;
      }
      layer.setStyle(options);
      if (!onMap.current.has(p.id)) { parcelGroup.current.addLayer(layer); onMap.current.add(p.id); }
    }
    if (selectedId) parcelLayers.current.get(selectedId)?.bringToFront();
  }, [parcels, baseIds, f.mode, f.cultures, f.othersStyle, f.seasonId, colors, threshold, selectedId]);

  // --- Navigation programmatique
  useEffect(() => {
    const m = map.current; if (!m || !fly) return;
    if (fly.bounds) m.flyToBounds(fly.bounds, { padding: [40, 40], maxZoom: 14, duration: 0.8 });
    else if (fly.center) m.flyTo(fly.center, fly.zoom ?? 12, { duration: 0.8 });
  }, [fly]);

  // --- Parcelle sélectionnée : recentrage doux si hors vue
  useEffect(() => {
    const m = map.current; if (!m || !selectedId) return;
    const p = latest.current.parcels.get(selectedId);
    if (p && !m.getBounds().contains(p.centroid)) m.panTo(p.centroid);
  }, [selectedId]);

  // --- Dessin de zone
  useEffect(() => {
    const m = map.current; if (!m) return;
    m.getContainer().classList.toggle('is-drawing', drawing);
    if (drawing) m.doubleClickZoom.disable(); else m.doubleClickZoom.enable();
  }, [drawing]);

  useEffect(() => {
    draftGroup.current.clearLayers();
    if (!draft.length) return;
    L.polyline(draft, { color: '#0F7F86', weight: 2.5, dashArray: '6 4' }).addTo(draftGroup.current);
    draft.forEach((pt, i) => L.circleMarker(pt, { radius: i === 0 ? 6 : 4, color: '#0F7F86', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(draftGroup.current));
  }, [draft]);

  useEffect(() => {
    zoneGroup.current.clearLayers();
    if (!zone) return;
    const poly = L.polygon(zone, { color: '#0F7F86', weight: 2.5, dashArray: '8 5', fillColor: '#0F7F86', fillOpacity: 0.06, interactive: false }).addTo(zoneGroup.current);
    const pts = zone.map((z) => [...z] as [number, number]);
    zone.forEach((pt, i) => {
      const mk = L.marker(pt, { draggable: true, icon: L.divIcon({ className: 'zone-handle', iconSize: [14, 14] }), keyboard: false, title: 'Déplacer ce sommet' });
      mk.on('drag', () => { const ll = mk.getLatLng(); pts[i] = [ll.lat, ll.lng]; poly.setLatLngs(pts); });
      mk.on('dragend', () => useApp.getState().setZone(pts.map((p) => [p[0], p[1]] as [number, number])));
      mk.addTo(zoneGroup.current);
    });
  }, [zone]);

  return <div ref={el} className="map" role="application" aria-label="Carte des parcelles agricoles" />;
}
