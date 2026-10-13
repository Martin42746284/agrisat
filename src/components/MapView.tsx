import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { useApp } from '../store/useApp';
import { computeStyle } from '../lib/style';
import { cultureLabel } from '../data/constants';
import { fmtHa } from '../lib/format';
import type { Parcel } from '../types';
import { useViewportParcelTracing } from '../hooks/useViewportParcelTracing';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_CENTER = { lat: -19.848219, lng: 47.011882 };
const DEFAULT_ZOOM = 16;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

export default function MapView({ baseIds }: { baseIds: Set<string> }) {
  const traceIdleHandler = useViewportParcelTracing();
  const [map, setMap] = useState<google.maps.Map | null>(null);
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

  const parcelLayers = useRef(new Map<string, google.maps.Polygon>());
  const onMap = useRef(new Set<string>());
  const regionLayers = useRef<google.maps.Polygon[]>([]);
  const communeLayers = useRef<google.maps.Polygon[]>([]);
  const draftLine = useRef<google.maps.Polyline | null>(null);
  const draftMarkers = useRef<google.maps.Marker[]>([]);
  const zonePolygon = useRef<google.maps.Polygon | null>(null);
  const zoneMarkers = useRef<google.maps.Marker[]>([]);
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);

  const latest = useRef({ parcels: new Map<string, Parcel>(), seasonId: f.seasonId, drawing });
  latest.current.seasonId = f.seasonId;
  latest.current.drawing = drawing;
  const center = useMemo(() => DEFAULT_CENTER, []);
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    mapTypeId: basemap === 'satellite' ? 'satellite' : 'roadmap',
    minZoom: 5,
    maxZoom: 18,
    zoomControl: true,
    scaleControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy',
  }), [basemap]);

  // Carte, clics de dessin et écoute du déplacement/zoom pour lancer le traçage.
  useEffect(() => {
    if (!map) return;
    infoWindow.current = new google.maps.InfoWindow();
    const idle = map.addListener('idle', () => traceIdleHandler.current(map));
    const click = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (latest.current.drawing && event.latLng) {
        useApp.getState().addDraftPoint([event.latLng.lat(), event.latLng.lng()]);
      }
    });
    map.getDiv().classList.toggle('is-drawing', drawing);
    traceIdleHandler.current(map);
    return () => {
      idle.remove();
      click.remove();
      infoWindow.current?.close();
      infoWindow.current = null;
      parcelLayers.current.forEach((layer) => layer.setMap(null));
      parcelLayers.current.clear();
      regionLayers.current.forEach((layer) => layer.setMap(null));
      regionLayers.current = [];
      communeLayers.current.forEach((layer) => layer.setMap(null));
      communeLayers.current = [];
      map.getDiv().classList.remove('is-drawing');
      onMap.current.clear();
    };
  }, [map, traceIdleHandler]);

  // Fond de carte Google : imagerie satellite ou plan routier.
  useEffect(() => {
    if (map) map.setMapTypeId(basemap === 'satellite' ? 'satellite' : 'roadmap');
  }, [basemap, map]);

  // Régions et couverture des communes.
  useEffect(() => {
    regionLayers.current.forEach((layer) => layer.setMap(null));
    communeLayers.current.forEach((layer) => layer.setMap(null));
    regionLayers.current = [];
    communeLayers.current = [];
    if (!map) return;

    for (const region of regions) {
      regionLayers.current.push(new google.maps.Polygon({
        map,
        paths: region.outline.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: '#12262B', strokeOpacity: 0.55, strokeWeight: 1.5,
        fillOpacity: 0, clickable: false, zIndex: 1,
      }));
    }
    for (const commune of communes) {
      const style = commune.coverage === 'analysee'
        ? { strokeColor: '#0F7F86', strokeWeight: 1, fillColor: '#0F7F86', fillOpacity: 0.05 }
        : commune.coverage === 'partielle'
          ? { strokeColor: '#C98A00', strokeWeight: 1.6, fillColor: '#F2B84B', fillOpacity: 0.14 }
          : { strokeColor: '#5B6770', strokeWeight: 1.4, fillColor: '#5B6770', fillOpacity: 0.25 };
      const label = commune.coverage === 'analysee' ? 'Analysée'
        : commune.coverage === 'partielle' ? 'Couverture partielle (nuages)' : 'Aucune donnée — non analysée';
      const polygon = new google.maps.Polygon({
        map: showCoverage ? map : null,
        paths: commune.outline.map(([lat, lng]) => ({ lat, lng })),
        ...style,
        strokeOpacity: 0.8,
        clickable: true,
        zIndex: 2,
      });
      polygon.addListener('mouseover', (event: google.maps.MapMouseEvent) => {
        if (!event.latLng || !infoWindow.current) return;
        infoWindow.current.setContent(`<b>${commune.name}</b><br/>${label}<br/>Image : ${commune.imageDate ?? '—'} · nuages ${Math.round(commune.cloudCover * 100)} %`);
        infoWindow.current.setPosition(event.latLng);
        infoWindow.current.open({ map });
      });
      polygon.addListener('mouseout', () => infoWindow.current?.close());
      communeLayers.current.push(polygon);
    }
    return () => {
      regionLayers.current.forEach((layer) => layer.setMap(null));
      communeLayers.current.forEach((layer) => layer.setMap(null));
      regionLayers.current = [];
      communeLayers.current = [];
    };
  }, [map, regions, communes, showCoverage]);

  // Création des contours de parcelles — les objets persistants sont réutilisés lors des restylages.
  useEffect(() => {
    const index = new Map<string, Parcel>();
    for (const parcel of parcels) index.set(parcel.id, parcel);
    latest.current.parcels = index;
    if (!map) return;

    for (const parcel of parcels) {
      if (parcelLayers.current.has(parcel.id)) continue;
      const polygon = new google.maps.Polygon({
        map: null,
        paths: parcel.coords.map(([lat, lng]) => ({ lat, lng })),
        clickable: true,
        zIndex: 10,
      });
      polygon.addListener('click', () => {
        if (!latest.current.drawing) useApp.getState().select(parcel.id);
      });
      polygon.addListener('mouseover', (event: google.maps.MapMouseEvent) => {
        const current = latest.current.parcels.get(parcel.id);
        const result = current?.results[latest.current.seasonId];
        if (!current || !result || !event.latLng || !infoWindow.current) return;
        infoWindow.current.setContent(
          `<b>${current.id}</b><br/>${cultureLabel(result.culture)} · ${Math.round(result.confidence * 100)} %<br/>${fmtHa(current.areaHa)}`,
        );
        infoWindow.current.setPosition(event.latLng);
        infoWindow.current.open({ map });
      });
      polygon.addListener('mouseout', () => infoWindow.current?.close());
      parcelLayers.current.set(parcel.id, polygon);
    }
  }, [map, parcels]);

  // Visibilité et styles : aucun nouveau calcul IA lors d’un changement de filtre.
  useEffect(() => {
    if (!map) return;
    const context = { colors, threshold, mode: f.mode, cultures: new Set(f.cultures), othersStyle: f.othersStyle };
    for (const parcel of parcels) {
      const polygon = parcelLayers.current.get(parcel.id);
      if (!polygon) continue;
      const result = parcel.results[f.seasonId];
      const wanted = !!result && baseIds.has(parcel.id);
      if (!wanted) {
        polygon.setMap(null);
        onMap.current.delete(parcel.id);
        continue;
      }
      const { visible, options } = computeStyle(result, context, parcel.id === selectedId);
      if (!visible) {
        polygon.setMap(null);
        onMap.current.delete(parcel.id);
        continue;
      }
      polygon.setOptions({
        fillColor: options.fillColor,
        fillOpacity: options.fillOpacity,
        strokeColor: options.color,
        strokeOpacity: options.opacity,
        strokeWeight: options.weight,
        zIndex: parcel.id === selectedId ? 1000 : 10,
      });
      if (!onMap.current.has(parcel.id)) {
        polygon.setMap(map);
        onMap.current.add(parcel.id);
      }
    }
  }, [map, parcels, baseIds, f.mode, f.cultures, f.othersStyle, f.seasonId, colors, threshold, selectedId]);

  // Afficher/masquer la couverture sans recréer les polygones.
  useEffect(() => {
    communeLayers.current.forEach((layer) => layer.setMap(showCoverage ? map : null));
  }, [showCoverage, map]);

  // Navigation programmatique.
  useEffect(() => {
    if (!map || !fly) return;
    if (fly.bounds) {
      const [[south, west], [north, east]] = fly.bounds;
      map.fitBounds(new google.maps.LatLngBounds({ lat: south, lng: west }, { lat: north, lng: east }), 40);
    } else if (fly.center) {
      map.panTo({ lat: fly.center[0], lng: fly.center[1] });
      map.setZoom(fly.zoom ?? 12);
    }
  }, [fly, map]);

  // Parcelle sélectionnée : recentrage doux si hors vue.
  useEffect(() => {
    if (!map || !selectedId) return;
    const parcel = latest.current.parcels.get(selectedId);
    if (!parcel) return;
    const bounds = map.getBounds();
    if (!bounds?.contains({ lat: parcel.centroid[0], lng: parcel.centroid[1] })) {
      map.panTo({ lat: parcel.centroid[0], lng: parcel.centroid[1] });
    }
  }, [map, selectedId]);

  // Mode dessin : clics de carte ajoutent des points au polygone temporaire.
  useEffect(() => {
    if (map) map.getDiv().classList.toggle('is-drawing', drawing);
  }, [drawing, map]);

  useEffect(() => {
    draftLine.current?.setMap(null);
    draftMarkers.current.forEach((marker) => marker.setMap(null));
    draftMarkers.current = [];
    if (!map || draft.length === 0) return;
    if (draft.length > 1) {
      draftLine.current = new google.maps.Polyline({
        map,
        path: draft.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: '#0F7F86', strokeOpacity: 1, strokeWeight: 2.5,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '8px' }],
        clickable: false,
      });
    }
    draft.forEach(([lat, lng], index) => {
      draftMarkers.current.push(new google.maps.Marker({
        map,
        position: { lat, lng },
        clickable: false,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: index === 0 ? 6 : 4,
          fillColor: '#fff', fillOpacity: 1,
          strokeColor: '#0F7F86', strokeWeight: 2,
        },
      }));
    });
  }, [draft, map]);

  useEffect(() => {
    zonePolygon.current?.setMap(null);
    zoneMarkers.current.forEach((marker) => marker.setMap(null));
    zoneMarkers.current = [];
    if (!map || !zone) return;
    const points = zone.map(([lat, lng]) => ({ lat, lng }));
    const polygon = new google.maps.Polygon({
      map,
      paths: points,
      strokeColor: '#0F7F86', strokeOpacity: 1, strokeWeight: 2.5,
      fillColor: '#0F7F86', fillOpacity: 0.06,
      clickable: false, zIndex: 50,
    });
    zonePolygon.current = polygon;
    zone.forEach((point, index) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: point[0], lng: point[1] },
        draggable: true,
        title: 'Déplacer ce sommet',
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 7,
          fillColor: '#fff', fillOpacity: 1,
          strokeColor: '#0F7F86', strokeWeight: 3,
        },
      });
      marker.addListener('drag', () => {
        const position = marker.getPosition();
        if (!position) return;
        points[index] = { lat: position.lat(), lng: position.lng() };
        polygon.setPath(points);
      });
      marker.addListener('dragend', () => {
        useApp.getState().setZone(points.map(({ lat, lng }) => [lat, lng] as [number, number]));
      });
      zoneMarkers.current.push(marker);
    });
  }, [zone, map]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'agrisat-google-maps',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  if (!GOOGLE_MAPS_API_KEY) {
    return <div className="map map-message" role="alert">Configurez VITE_GOOGLE_MAPS_API_KEY pour afficher Google Maps.</div>;
  }
  if (loadError) return <div className="map map-message" role="alert">Google Maps n’a pas pu être chargé. Vérifiez la clé API et les restrictions de domaine.</div>;
  if (!isLoaded) return <div className="map map-message" role="status">Chargement de Google Maps…</div>;

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      mapContainerClassName="map"
      center={center}
      zoom={DEFAULT_ZOOM}
      options={mapOptions}
      onLoad={setMap}
      onUnmount={() => setMap(null)}
    />
  );
}