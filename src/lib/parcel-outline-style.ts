import type { Parcel } from '../types';

/** Style cartographique des contours VHR, accordé à la fiabilité mesurée par taille. */
export function parcelOutlineStyle(parcel: Parcel, selected = false) {
  const reliable = parcel.areaHa >= 0.5;
  const visible = parcel.areaHa >= 0.1;
  const base = reliable
    ? { strokeColor: '#FFFFFF', strokeOpacity: 0.96, strokeWeight: 1.6 }
    : visible
      ? { strokeColor: '#FFD166', strokeOpacity: 0.82, strokeWeight: 1.2 }
      : { strokeColor: '#FFD166', strokeOpacity: 0.48, strokeWeight: 0.85 };

  return {
    ...base,
    strokeColor: selected ? '#FF9F1C' : base.strokeColor,
    strokeOpacity: selected ? 1 : base.strokeOpacity,
    strokeWeight: selected ? 2.8 : base.strokeWeight,
    fillColor: selected ? '#FFB703' : base.strokeColor,
    fillOpacity: selected ? 0.14 : 0.035,
  };
}
