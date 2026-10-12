import type L from 'leaflet';
import type { CropResult, CultureId, DisplayMode, OthersStyle } from '../types';
import { darken } from './color';
import { isUncertain } from './filter';

export interface StyleCtx {
  colors: Record<CultureId, string>;
  threshold: number;
  mode: DisplayMode;
  cultures: Set<CultureId>;
  othersStyle: OthersStyle;
}

/**
 * Style d'une parcelle. Changer couleur ou filtre ne fait que recalculer ceci :
 * aucune relance de l'IA (exigence REC-06).
 * L'incertitude n'est pas portée par la couleur seule : contour pointillé (incertain),
 * trait très espacé (obsolète), contour épais (vérifié / corrigé).
 */
export function computeStyle(r: CropResult, ctx: StyleCtx, selected: boolean): { visible: boolean; options: L.PathOptions } {
  const hasSel = ctx.mode !== 'general' && ctx.cultures.size > 0;
  const isSel = ctx.cultures.has(r.culture);

  if (hasSel && !isSel) {
    if (ctx.mode === 'filtre' && ctx.othersStyle === 'masque') return { visible: false, options: {} };
    return {
      visible: true,
      options: selected
        ? { color: '#111', weight: 3, fillColor: '#9AA3A1', fillOpacity: 0.35, opacity: 1, dashArray: undefined }
        : { color: '#9AA3A1', weight: 0.6, fillColor: '#B9C0BE', fillOpacity: 0.22, opacity: 0.55, dashArray: undefined },
    };
  }

  const fill = ctx.colors[r.culture];
  const uncertain = isUncertain(r, ctx.threshold);
  const obsolete = r.status === 'obsolete';
  const unknown = r.culture === 'inconnue';
  const validated = r.status === 'verifie_terrain' || r.status === 'corrige';

  let fillOpacity = hasSel ? 0.8 : 0.62;
  if (uncertain) fillOpacity *= 0.7;
  if (obsolete) fillOpacity *= 0.55;
  if (unknown) fillOpacity = 0.3;

  const options: L.PathOptions = {
    fillColor: fill,
    fillOpacity,
    color: darken(fill, 0.4),
    weight: validated ? 2.2 : 1,
    opacity: 0.95,
    dashArray: unknown || uncertain ? '4 3' : obsolete ? '1 4' : undefined,
  };
  if (selected) Object.assign(options, { color: '#0B1F24', weight: 3.5, fillOpacity: Math.max(fillOpacity, 0.75), dashArray: undefined });
  return { visible: true, options };
}
