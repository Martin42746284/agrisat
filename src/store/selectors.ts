import { useMemo } from 'react';
import { useApp } from './useApp';
import { aggregate, baseFilter, cultureFilter } from '../lib/filter';

/** Parcelles passant tous les filtres « données » (région, saison, superficie, confiance, statut, zone…). */
export function useBase() {
  const parcels = useApp((s) => s.parcels);
  const f = useApp((s) => s.filters);
  const zone = useApp((s) => s.zone);
  return useMemo(
    () => baseFilter(parcels, f, zone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parcels, f.regionId, f.communeId, f.seasonId, f.dateFrom, f.dateTo, f.areaMin, f.areaMax, f.confMin, f.statuses, zone],
  );
}

/** Idem + sélection de cultures (hors vue générale). Source unique pour la carte, les tableaux et les exports. */
export function useFinal() {
  const base = useBase();
  const mode = useApp((s) => s.filters.mode);
  const cultures = useApp((s) => s.filters.cultures);
  return useMemo(() => cultureFilter(base, { mode, cultures } as never), [base, mode, cultures]);
}

export function useAggregate(views: ReturnType<typeof useBase>) {
  const threshold = useApp((s) => s.threshold);
  return useMemo(() => aggregate(views, threshold), [views, threshold]);
}

export function usePerms() {
  const role = useApp((s) => s.user?.role);
  return role;
}
