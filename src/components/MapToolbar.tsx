import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, Eraser, Home, Layers, PenTool, Search, Undo2, X, ScanSearch, Wand2, Waypoints, Radar, Navigation, ThermometerSun } from 'lucide-react';
import { useApp } from '../store/useApp';
import { bboxOf, centroidOf, M_PER_DEG_LAT, mPerDegLng, ringAreaHa } from '../lib/geometry';
import { normalize } from '../lib/format';
import { api } from '../api/services';
import { maltoVhrToFrontend, type MaltoVhrFeature } from '../api/maltoAdapter';
import { maltoToFrontend, type MaltoParcel } from '../api/maltoAdapter';

const NATIONAL: [[number, number], [number, number]] = [[-25.8, 43.0], [-11.8, 50.7]];

export default function MapToolbar({ onAnalyze, canLaunch }: { onAnalyze: () => void; canLaunch: boolean }) {
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const regions = useApp((s) => s.regions);
  const communes = useApp((s) => s.communes);
  const flyTo = useApp((s) => s.flyTo);
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);
  const showCoverage = useApp((s) => s.showCoverage);
  const setShowCoverage = useApp((s) => s.setShowCoverage);
  const drawing = useApp((s) => s.drawing);
  const draft = useApp((s) => s.draft);
  const zone = useApp((s) => s.zone);
  const manualParcelDraft = useApp((s) => s.manualParcelDraft);
  const drawMode = useApp((s) => s.drawMode);
  const { startDraw, startParcelDraw, undoDraft, finishDraw, cancelDraw, clearManualParcelDraft, addManualParcel, setZone } = useApp.getState();
  const traceInfo = useApp((s) => s.traceInfo);
  const addTracedParcels = useApp((s) => s.addTracedParcels);
  const toast = useApp((s) => s.toast);
  const parcels = useApp((s) => s.parcels);
  const automaticDetection = useApp((s) => s.automaticDetection);
  const setAutomaticDetection = useApp((s) => s.setAutomaticDetection);
  const selectedAutomaticParcelId = useApp((s) => s.selectedAutomaticParcelId);
  const selectAutomaticParcel = useApp((s) => s.selectAutomaticParcel);
  const automaticSearchCenter = useApp((s) => s.automaticSearchCenter);
  const setAutomaticSearchCenter = useApp((s) => s.setAutomaticSearchCenter);
  const [pending, setPending] = useState(false);
  const [traceErr, setTraceErr] = useState<string | null>(null);
  const [parcelLabel, setParcelLabel] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [parcelNotes, setParcelNotes] = useState('');
  const [savingParcel, setSavingParcel] = useState(false);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [autoSearchOpen, setAutoSearchOpen] = useState(false);
  const [autoLat, setAutoLat] = useState('-19.852210');
  const [autoLng, setAutoLng] = useState('47.010822');
  const [autoRadiusM, setAutoRadiusM] = useState('100');
  const [baseTemperature, setBaseTemperature] = useState('5');
  const [gddThreshold, setGddThreshold] = useState('2000');
  const [periodDays, setPeriodDays] = useState('130');
  const [autoSearchError, setAutoSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const coordinateFromInput = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!automaticSearchCenter) return;
    if (coordinateFromInput.current?.[0] === automaticSearchCenter[0]
      && coordinateFromInput.current?.[1] === automaticSearchCenter[1]) {
      coordinateFromInput.current = null;
      return;
    }
    setAutoLat(automaticSearchCenter[0].toFixed(6));
    setAutoLng(automaticSearchCenter[1].toFixed(6));
  }, [automaticSearchCenter]);

  // Annulation au démontage (changement de page) : pas de mise à jour d'état après.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Traçage automatique des contours (backend AGRISAT → service JECAM / Delineate Anything).
   * Rayon plafonné à 1 000 m, calcul long : requête annulable, garde anti double-clic.
   */
  const trace = async () => {
    if (!zone || pending) return;
    abortRef.current?.abort(); // annule une trace précédente éventuelle
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPending(true);
    setTraceErr(null);
    try {
      const center = centroidOf(zone);
      const kx = mPerDegLng(center[0]);
      let maxM = 0;
      for (const [la, lo] of zone) {
        const d = Math.hypot((la - center[0]) * M_PER_DEG_LAT, (lo - center[1]) * kx);
        if (d > maxM) maxM = d;
      }
      const radius_m = Math.min(1000, Math.max(200, Math.round(maxM * 1.2)));
      const res = await api.zoneParcels(
        { latitude: center[0], longitude: center[1], radius_m, min_confidence: 0, min_area_ha: 0, mode: 'simple' },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const features = (res.geojson?.features ?? []) as MaltoVhrFeature[];
      const traced = maltoVhrToFrontend(features, { regions, communes });
      const added = addTracedParcels(traced, {
        count: traced.length,
        added: 0, // recalculé par l'action (contours réellement nouveaux)
        attribution: res.attribution,
        warnings: res.warnings ?? [],
        at: new Date().toISOString(),
      });
      toast(
        traced.length === 0
          ? 'Aucune parcelle tracée dans ce rayon (image ou service de tracage indisponible).'
          : added === 0
            ? `${traced.length} contours tracés — tous déjà présents, aucune nouvelle parcelle. ` +
              'Le service de tracage renvoie actuellement sa base précalculée quel que soit le lieu ; ' +
              'une remesure est nécessaire côté backend (service VHR) pour obtenir de nouveaux contours.'
            : `${added} nouvelle(s) parcelle(s) ajoutée(s) — ${traced.length} contours tracés au total (IA indicatifs).`,
        traced.length === 0 ? 'warn' : 'ok',
      );
    } catch (err) {
      if (!ctrl.signal.aborted) setTraceErr(err instanceof Error ? err.message : String(err));
    } finally {
      if (!ctrl.signal.aborted) setPending(false);
    }
  };

  const saveManualParcel = async () => {
    if (!manualParcelDraft || savingParcel) return;
    setSavingParcel(true);
    setParcelError(null);
    try {
      const center = centroidOf(manualParcelDraft);
      const saved = await api.createParcel({
        label: parcelLabel.trim() || `Parcelle manuelle ${new Date().toLocaleDateString('fr-FR')}`,
        coordinates: manualParcelDraft.map(([lat, lng]) => ({ lat, lng })),
        center_lat: center[0],
        center_lng: center[1],
        surface_ha: ringAreaHa(manualParcelDraft),
        culture_declared: 'Inconnue',
        culture_detected: null,
        ndvi_percentage: null,
        ndre: null,
        spectral_bands: null,
        confidence: null,
        verdict: 'Contour tracé manuellement — à vérifier sur le terrain',
        details: 'Contour dessiné manuellement sur la carte Google Maps.',
        saison: null,
        soil_type: null,
        risk_factors: [],
        recommendations: null,
        data_source: 'Tracé manuel',
        owner_name: ownerName.trim(),
        notes: parcelNotes.trim(),
        time_series_s2: [],
        time_series_s1: [],
        time_series_rain: [],
        estimated_planting_date: null,
        estimated_harvest_date: null,
        days_since_planting: null,
        growth_stage: null,
        planting_confidence: null,
        evi: null,
        savi: null,
        ndwi: null,
        agro_score: null,
        hybrid_score: null,
        cnn_prob_barley: null,
        cnn_prob_non_barley: null,
      });
      const [parcel] = maltoToFrontend([saved as unknown as MaltoParcel], { regions, communes });
      if (!parcel) throw new Error('La parcelle a été enregistrée, mais sa géométrie est invalide.');
      addManualParcel(parcel);
      setParcelLabel('');
      setOwnerName('');
      setParcelNotes('');
      toast('Parcelle manuelle enregistrée.', 'ok');
    } catch (error) {
      setParcelError(error instanceof Error ? error.message : 'Impossible d’enregistrer la parcelle.');
    } finally {
      setSavingParcel(false);
    }
  };

  const searchAutomatic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const lat = Number(autoLat);
    const lng = Number(autoLng);
    const radiusM = Number(autoRadiusM);
    const base = Number(baseTemperature);
    const threshold = Number(gddThreshold);
    const period = Number(periodDays);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setAutoSearchError('Vérifiez la latitude et la longitude.'); return;
    }
    if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 20_000) {
      setAutoSearchError('Le rayon doit être compris entre 50 m et 20 km.'); return;
    }
    if (!Number.isFinite(base) || base < -20 || base > 30) {
      setAutoSearchError('La température de base doit être comprise entre -20 et 30 °C.'); return;
    }
    if (!Number.isFinite(threshold) || threshold < 2_000 || threshold > 10_000) {
      setAutoSearchError('Le seuil doit être compris entre 2 000 et 10 000 °C.'); return;
    }
    if (!Number.isInteger(period) || period < 1 || period > 730) {
      setAutoSearchError('La période doit être comprise entre 1 et 730 jours.'); return;
    }

    setAutoSearchError(null);
    setAutomaticSearchCenter([lat, lng]);
    setAutomaticDetection(null);
    selectAutomaticParcel(null);
    setPending(true);
    try {
      // Envoyer en priorité les contours VHR déjà tracés autour du centre ; sinon,
      // le backend déclenchera sa cascade de découverte de parcelles.
      const scale = Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.1);
      const tracedParcels = parcels
        .filter((parcel) => Object.values(parcel.results).some((result) => result.modelVersion.includes('Delineate Anything')))
        .map((parcel) => {
          const east = (parcel.centroid[1] - lng) * 111_320 * scale;
          const north = (parcel.centroid[0] - lat) * 110_574;
          return { parcel, distance: Math.hypot(east, north) };
        })
        .filter(({ distance }) => distance <= radiusM + 300)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 500)
        .map(({ parcel }) => ({ coordinates: parcel.coords.map(([pointLat, pointLng]) => ({ lat: pointLat, lng: pointLng })) }));
      const result = await api.detectParcels({
        lat, lng, radiusKm: radiusM / 1000,
        baseTemperature: base, threshold, periodDays: period,
        tracedParcels,
      });
      setAutomaticDetection(result);
      selectAutomaticParcel(null);
      const barley = result.parcels.filter((candidate) => candidate.analysis?.is_barley === true).length;
      toast(`${result.candidates_found} candidat(s) analysé(s) — ${barley} avec orge détectée.`, barley ? 'ok' : 'info');
    } catch (error) {
      setAutoSearchError(error instanceof Error ? error.message : 'La recherche automatique a échoué.');
    } finally {
      setPending(false);
    }
  };

  const toggleAutoSearch = () => {
    if (autoSearchOpen) {
      setAutoSearchOpen(false);
      setAutomaticSearchCenter(null);
      return;
    }
    const lat = Number(autoLat);
    const lng = Number(autoLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setAutomaticSearchCenter([lat, lng]);
    setAutoSearchOpen(true);
  };

  const updateSearchCoordinate = (axis: 'lat' | 'lng', value: string) => {
    if (axis === 'lat') setAutoLat(value); else setAutoLng(value);
    const lat = Number(axis === 'lat' ? value : autoLat);
    const lng = Number(axis === 'lng' ? value : autoLng);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      coordinateFromInput.current = [lat, lng];
      setAutomaticSearchCenter(coordinateFromInput.current);
    }
  };

  const results = useMemo(() => {
    const n = normalize(q.trim());
    if (!n) return [];
    return [
      ...regions.map((r) => ({ key: r.id, label: r.name, sub: 'Région', bounds: bboxOf(r.outline) })),
      ...communes.map((c) => ({ key: c.id, label: c.name, sub: `Commune · ${regions.find((r) => r.id === c.regionId)?.name}`, bounds: bboxOf(c.outline) })),
    ].filter((x) => normalize(x.label).includes(n)).slice(0, 6);
  }, [q, regions, communes]);

  useEffect(() => {
    if (!drawing) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') useApp.getState().finishDraw();
      if (e.key === 'Escape') useApp.getState().cancelDraw();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawing]);

  return (
    <>
      <div className="maptools">
        <div className="toolgroup glass" role="group" aria-label="Outils de carte">
          <div className="searchwrap">
            <button className={`tool ${searchOpen ? 'tool--on' : ''}`} data-tip="Rechercher un lieu" aria-label="Rechercher un lieu" onClick={() => setSearchOpen(!searchOpen)}><Search size={18} /></button>
            {searchOpen && (
              <div className="searchpop glass">
                <Search size={15} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. Antsirabe, Itasy…" aria-label="Rechercher un lieu" />
                {q && (
                  <ul className="searchpop__results">
                    {results.length === 0 && <li className="searchpop__none">Aucun lieu dans les zones pilotes.</li>}
                    {results.map((r) => (
                      <li key={r.key}><button onClick={() => { flyTo({ bounds: r.bounds }); setQ(''); setSearchOpen(false); }}><b>{r.label}</b><span>{r.sub}</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button className="tool" data-tip="Vue nationale" aria-label="Retour à l'emprise nationale" onClick={() => flyTo({ bounds: NATIONAL })}><Home size={18} /></button>
          <button className={`tool ${basemap === 'satellite' ? 'tool--on' : ''}`} data-tip={basemap === 'plan' ? 'Fond satellite' : 'Fond plan'} aria-label="Basculer plan / satellite" onClick={() => setBasemap(basemap === 'plan' ? 'satellite' : 'plan')}><Layers size={18} /></button>
          <button className={`tool ${showCoverage ? 'tool--on' : ''}`} data-tip="Couverture des analyses" aria-label="Afficher la couverture des analyses" onClick={() => setShowCoverage(!showCoverage)}><Crosshair size={18} /></button>
          <button className={`tool ${autoSearchOpen ? 'tool--on' : ''}`} data-tip="Recherche automatique orge / non-orge" aria-label="Ouvrir l’analyse automatique des cultures" aria-expanded={autoSearchOpen} onClick={toggleAutoSearch}><Radar size={18} /></button>
          {!drawing && !zone && <button className="tool" data-tip="Dessiner une zone d’étude" aria-label="Dessiner une zone d’étude" onClick={startDraw}><PenTool size={18} /></button>}
          {!drawing && <button className="tool" data-tip="Tracer une parcelle manuellement" aria-label="Tracer une parcelle manuellement" onClick={startParcelDraw}><Waypoints size={18} /></button>}
        </div>

        {autoSearchOpen && (
          <section className="autosearch glass" aria-label="Recherche automatique de parcelles et d’orge">
            <header className="autosearch__head">
              <b><Radar size={16} /> Recherche automatique</b>
              <button className="icon-btn" onClick={() => { setAutoSearchOpen(false); setAutomaticSearchCenter(null); }} aria-label="Fermer le formulaire"><X size={17} /></button>
            </header>
            <form className="autosearch__form" onSubmit={searchAutomatic}>
              <label className="field"><span>Latitude</span><input type="number" step="any" value={autoLat} onChange={(e) => updateSearchCoordinate('lat', e.target.value)} required /></label>
              <label className="field"><span>Longitude</span><input type="number" step="any" value={autoLng} onChange={(e) => updateSearchCoordinate('lng', e.target.value)} required /></label>
              <label className="field"><span>Rayon terrain réel (m)</span><input type="number" min="50" max="20000" step="10" value={autoRadiusM} onChange={(e) => setAutoRadiusM(e.target.value)} required /><small>De 50 m à 20 km, indépendant du zoom.</small></label>
              <fieldset className="autosearch__gdd">
                <legend><ThermometerSun size={15} /> Paramètres degrés-jours</legend>
                <div className="autosearch__grid">
                  <label className="field"><span>Tbase (°C)</span><input type="number" min="-20" max="30" step="0.1" value={baseTemperature} onChange={(e) => setBaseTemperature(e.target.value)} required /></label>
                  <label className="field"><span>Seuil (°C)</span><input type="number" min="2000" max="10000" step="1" value={gddThreshold} onChange={(e) => setGddThreshold(e.target.value)} required /></label>
                </div>
                <label className="field"><span>Période de culture (jours)</span><input type="number" min="1" max="730" step="1" value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} required /></label>
              </fieldset>
              {autoSearchError && <p className="note note--danger">{autoSearchError}</p>}
              <button className="btn btn--primary" type="submit" disabled={pending}>
                <Navigation size={15} /> {pending ? 'Analyse en cours…' : 'Lancer l’analyse automatique'}
              </button>
            </form>
            {automaticDetection && (
              <div className="autosearch__results">
                <b>Résultat : {automaticDetection.candidates_found} parcelle(s) · {automaticDetection.analyzed_count} analysée(s)</b>
                <span className="hint">
                  Orge : {automaticDetection.parcels.filter((candidate) => candidate.analysis?.is_barley === true).length}
                  {' · '}Non-orge : {automaticDetection.parcels.filter((candidate) => candidate.analysis?.is_barley === false).length}
                  {' · '}À vérifier : {automaticDetection.parcels.filter((candidate) => !candidate.analysis || candidate.analysis.is_barley == null).length}
                </span>
                {automaticDetection.notice && <p className="hint">{automaticDetection.notice}</p>}
                {automaticDetection.parcels.map((candidate) => {
                  const analysis = candidate.analysis;
                  const isBarley = analysis?.is_barley === true;
                  const label = analysis?.culture_detected ?? (candidate.analysis_error ? 'Analyse indisponible' : 'Non classée');
                  return (
                    <button className={`autosearch__result ${selectedAutomaticParcelId === candidate.id ? 'is-selected' : ''}`} key={candidate.id} onClick={() => { selectAutomaticParcel(candidate.id); flyTo({ center: [candidate.center.lat, candidate.center.lng], zoom: 17 }); }}>
                      <span className={`autosearch__dot ${isBarley ? 'autosearch__dot--barley' : analysis ? 'autosearch__dot--other' : ''}`} />
                      <span><strong>{label}</strong><small>{analysis?.verdict ?? candidate.analysis_error ?? candidate.tags.source ?? candidate.id}</small></span>
                      {analysis?.confidence != null && <em>{Math.round(analysis.confidence)}%</em>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {selectedAutomaticParcelId && automaticDetection && (() => {
          const candidate = automaticDetection.parcels.find((parcel) => parcel.id === selectedAutomaticParcelId);
          if (!candidate) return null;
          const result = candidate.analysis;
          const areaHa = ringAreaHa(candidate.coordinates.map(({ lat, lng }) => [lat, lng] as [number, number]));
          const presence = result?.barley_presence;
          const confidence = result?.confidence;
          const gdd = result?.gdd_cumulative;
          const gddThresholdValue = result?.gdd_threshold;
          const score = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)} %`;
          const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('fr-FR') : '—';
          return (
            <aside className="automatic-parcel-drawer glass" aria-label="Détails de l’analyse de la parcelle">
              <header className="automatic-parcel-drawer__head">
                <div><h2>{candidate.analysis?.culture_detected ?? 'Parcelle analysée'}</h2><p>{candidate.id} · {candidate.tags.source ?? 'détection automatique'}</p></div>
                <button className="icon-btn" onClick={() => selectAutomaticParcel(null)} aria-label="Fermer les détails"><X size={18} /></button>
              </header>
              <div className="automatic-parcel-drawer__body">
                {!result ? (
                  <p className="note note--warn">{candidate.analysis_error ?? 'Aucun résultat d’analyse disponible.'}</p>
                ) : <>
                  <section className="automatic-parcel-summary">
                    <div className="automatic-parcel-shape" aria-hidden><span /></div>
                    <dl><dt>Superficie estimée</dt><dd>{areaHa.toFixed(2)} ha</dd><dt>Présence d’orge</dt><dd className={`presence presence--${presence ?? 'none'}`}>{presence === 'confirmed' ? 'Confirmée' : presence === 'probable' ? 'Probable' : 'Non détectée'}</dd></dl>
                  </section>
                  <section>
                    <h3>Résultat de classification</h3>
                    <div className="automatic-parcel-confidence"><strong>{result.culture_detected ?? 'Culture indéterminée'}</strong><b>{score(confidence)}</b></div>
                    <div className="automatic-parcel-meter"><i style={{ width: `${Math.min(100, Math.max(0, confidence ?? 0))}%` }} /></div>
                    <p>{result.verdict ?? 'Verdict indisponible.'}</p>
                    {result.details && <p className="hint">{result.details}</p>}
                  </section>
                  <section>
                    <h3>Scores des modèles</h3>
                    <dl className="automatic-parcel-kv">
                      <dt>Modèle Sentinel-2</dt><dd>{score(result.s2_prob_barley)}</dd>
                      <dt>Modèle RF</dt><dd>{score(result.rf_prob_barley)}</dd>
                      <dt>Modèle CNN</dt><dd>{result.cnn_available ? `${score(result.cnn_prob_barley)} orge · ${score(result.cnn_prob_non_barley)} non-orge` : 'Indisponible'}</dd>
                      <dt>Score agro</dt><dd>{score(result.agro_score)}</dd>
                      <dt>Score hybride</dt><dd>{score(result.hybrid_score)}</dd>
                    </dl>
                    {result.data_source && <p className="hint">Source : {result.data_source}</p>}
                  </section>
                  <section>
                    <h3>Degrés-jours de croissance</h3>
                    <dl className="automatic-parcel-kv">
                      <dt>Accumulation</dt><dd>{gdd == null ? 'Indisponible' : `${Math.round(gdd)} / ${gddThresholdValue ?? gddThreshold} °C`}</dd>
                      <dt>Température de base</dt><dd>{result.gdd_base_temperature ?? baseTemperature} °C</dd>
                      <dt>Période analysée</dt><dd>{date(result.gdd_start_date)} → {date(result.gdd_end_date)}</dd>
                      <dt>Seuil atteint</dt><dd>{result.gdd_detected == null ? 'Indisponible' : result.gdd_detected ? 'Oui' : 'Non'}</dd>
                      {result.growth_stage && <><dt>Stade cultural</dt><dd>{result.growth_stage}</dd></>}
                      {result.days_since_planting != null && <><dt>Depuis plantation</dt><dd>{result.days_since_planting} jours</dd></>}
                    </dl>
                    {result.gdd_error && <p className="note note--warn">Données degrés-jours : {result.gdd_error}</p>}
                  </section>
                  <section>
                    <h3>Indices satellitaires</h3>
                    <dl className="automatic-parcel-kv"><dt>NDVI</dt><dd>{score(result.percentage)}</dd><dt>EVI</dt><dd>{score(result.evi)}</dd><dt>SAVI</dt><dd>{score(result.savi)}</dd><dt>NDWI</dt><dd>{score(result.ndwi)}</dd><dt>Sol</dt><dd>{result.soil_type ?? '—'}</dd></dl>
                    {result.spectral_analysis && <p className="hint">{result.spectral_analysis}</p>}
                    {result.radar_analysis && <p className="hint">{result.radar_analysis}</p>}
                  </section>
                  {result.risk_factors?.length ? <section><h3>Facteurs de risque</h3><ul className="automatic-parcel-list">{result.risk_factors.map((risk) => <li key={risk}>{risk}</li>)}</ul></section> : null}
                  {(result.recommendations || result.agro_details) && <section><h3>Recommandations</h3><p>{result.recommendations ?? result.agro_details}</p></section>}
                  {result.warnings?.length ? <section><h3>Avertissements</h3>{result.warnings.map((warning) => <p className="note note--warn" key={warning}>{warning}</p>)}</section> : null}
                </>}
              </div>
            </aside>
          );
        })()}

        {zone && !drawing && (
          <div className="zonecard glass">
            <b>Zone d'étude</b>
            <button className="btn btn--sm" onClick={startDraw}><PenTool size={13} /> Redessiner</button>
            {canLaunch && <button className="btn btn--sm btn--primary" onClick={onAnalyze}><ScanSearch size={13} /> Analyser</button>}
            <button className="btn btn--sm" onClick={trace} disabled={pending}
              title="Tracer automatiquement les contours des parcelles (modèle JECAM via le backend)">
              <Wand2 size={13} /> {pending ? 'Tracé en cours…' : 'Tracer les contours'}
            </button>
            <button className="btn btn--sm" onClick={() => setZone(null)}><Eraser size={13} /> Supprimer</button>
            {pending && <span className="hint">Tracé IA en cours — plusieurs dizaines de secondes possibles…</span>}
            {traceErr && <p className="note note--danger">{traceErr}</p>}
            {traceInfo && !pending && (
              <span className="hint">
                {traceInfo.count} contour(s), {traceInfo.added} nouvelle(s) parcelle(s) ajoutée(s).
              </span>
            )}
          </div>
        )}
        {manualParcelDraft && (
          <div className="zonecard glass" aria-label="Enregistrer la parcelle dessinée">
            <b>Nouvelle parcelle — {manualParcelDraft.length} sommets · {ringAreaHa(manualParcelDraft).toFixed(2)} ha</b>
            <label className="field"><span>Nom de la parcelle</span><input value={parcelLabel} onChange={(event) => setParcelLabel(event.target.value)} placeholder="Ex. Parcelle nord" /></label>
            <label className="field"><span>Propriétaire / exploitant</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Facultatif" /></label>
            <label className="field"><span>Notes</span><input value={parcelNotes} onChange={(event) => setParcelNotes(event.target.value)} placeholder="Facultatif" /></label>
            {parcelError && <p className="note note--danger">{parcelError}</p>}
            <button className="btn btn--sm btn--primary" onClick={saveManualParcel} disabled={savingParcel}>
              <Check size={13} /> {savingParcel ? 'Enregistrement…' : 'Enregistrer la parcelle'}
            </button>
            <button className="btn btn--sm" onClick={clearManualParcelDraft} disabled={savingParcel}>Annuler</button>
          </div>
        )}
      </div>

      {drawing && (
        <div className="drawbar glass" role="status">
          <span>{drawMode === 'parcel' ? 'Cliquez sur la carte pour tracer la parcelle' : 'Cliquez sur la carte pour placer les sommets'} ({draft.length} placé{draft.length > 1 ? 's' : ''}).</span>
          <button className="btn btn--sm" onClick={undoDraft} disabled={!draft.length}><Undo2 size={13} /> Retirer</button>
          <button className="btn btn--sm btn--primary" onClick={finishDraw}><Check size={13} /> {drawMode === 'parcel' ? 'Terminer le contour' : 'Terminer'}</button>
          <button className="btn btn--sm" onClick={cancelDraw}><X size={13} /> Annuler</button>
        </div>
      )}
    </>
  );
}
