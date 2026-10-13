import { useCallback, useEffect, useRef } from 'react';
import { api } from '../api/services';
import { maltoVhrToFrontend, type MaltoVhrFeature } from '../api/maltoAdapter';
import { useApp } from '../store/useApp';
import { featuresInTile, MIN_TRACING_ZOOM, TILE_RADIUS_M, tilesForBounds, type TraceTile } from '../lib/viewport-tiles';

/** Trace, une seule requête à la fois, les parcelles des tuiles visibles à fort zoom. */
export function useViewportParcelTracing() {
  const completedTiles = useRef(new Set<string>());
  const tileParcelCounts = useRef(new Map<string, number>());
  const failedTiles = useRef(new Set<string>());
  const queue = useRef<TraceTile[]>([]);
  const visibleTiles = useRef<TraceTile[]>([]);
  const inflightKey = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const disposed = useRef(false);
  const tracingErrorShown = useRef(false);
  const idleHandler = useRef<(map: google.maps.Map) => void>(() => undefined);

  const traceNextTile = useCallback(() => {
    if (disposed.current || inflightKey.current) return;
    const tile = queue.current.shift();
    if (!tile) return;

    inflightKey.current = tile.key;
    const abortController = new AbortController();
    controller.current = abortController;
    api.zoneParcels({
      latitude: tile.center.lat,
      longitude: tile.center.lng,
      radius_m: TILE_RADIUS_M,
      min_confidence: 0,
      min_area_ha: 0,
      mode: 'simple',
    }, abortController.signal)
      .then((result) => {
        if (disposed.current) return;
        const features = featuresInTile((result.geojson?.features ?? []) as MaltoVhrFeature[], tile);
        completedTiles.current.add(tile.key);
        tileParcelCounts.current.set(tile.key, features.length);
        tracingErrorShown.current = false;

        const state = useApp.getState();
        const parcels = maltoVhrToFrontend(
          features,
          { regions: state.regions, communes: state.communes },
          `tile-${tile.key}`,
        );
        const count = [...tileParcelCounts.current.values()].reduce((sum, tileCount) => sum + tileCount, 0);
        const warnings = [...new Set([...(state.traceInfo?.warnings ?? []), ...(result.warnings ?? [])])];
        state.addTracedParcels(parcels, {
          count,
          added: 0,
          attribution: result.attribution || state.traceInfo?.attribution,
          warnings,
          at: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        if (disposed.current || abortController.signal.aborted) return;
        const status = typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : 0;
        if (status >= 400 && status < 500) failedTiles.current.add(tile.key);
        else {
          // Une panne du service interrompt la file ; le prochain déplacement réessaiera.
          queue.current = [];
          if (!tracingErrorShown.current) {
            const message = error instanceof Error ? error.message : 'Le traçage automatique des parcelles a échoué.';
            useApp.getState().toast(message, 'warn');
            tracingErrorShown.current = true;
          }
        }
      })
      .finally(() => {
        if (inflightKey.current === tile.key) inflightKey.current = null;
        if (controller.current === abortController) controller.current = null;
        traceNextTile();
      });
  }, []);

  const onViewportIdle = useCallback((map: google.maps.Map) => {
    if (disposed.current) return;
    if ((map.getZoom() ?? 0) < MIN_TRACING_ZOOM) {
      visibleTiles.current = [];
    } else {
      const bounds = map.getBounds();
      const center = map.getCenter();
      if (!bounds || !center) return;
      visibleTiles.current = tilesForBounds({
        south: bounds.getSouthWest().lat(), north: bounds.getNorthEast().lat(),
        west: bounds.getSouthWest().lng(), east: bounds.getNorthEast().lng(),
      }, { lat: center.lat(), lng: center.lng() });
    }

    const queued = new Set<string>();
    queue.current = visibleTiles.current.filter((tile) => {
      if (queued.has(tile.key) || completedTiles.current.has(tile.key)
        || failedTiles.current.has(tile.key) || tile.key === inflightKey.current) return false;
      queued.add(tile.key);
      return true;
    });
    traceNextTile();
  }, [traceNextTile]);

  idleHandler.current = onViewportIdle;

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      controller.current?.abort();
    };
  }, []);

  return idleHandler;
}
