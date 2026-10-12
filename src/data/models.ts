/** Métriques FICTIVES — à remplacer par le rapport d'évaluation du pilote. */
export const MODEL_VERSIONS = [
  { id: 'ResUNet 1.2.0', kind: 'Segmentation', status: 'Production', date: '2026-03-18', note: 'Entrées Sentinel-2 (10 bandes) + composite 3 dates' },
  { id: 'RF 1.1.0', kind: 'Classification', status: 'Production', date: '2026-03-18', note: '184 variables spectrales et temporelles par parcelle' },
  { id: 'XGBoost 1.2.0-rc1', kind: 'Classification', status: 'En comparaison', date: '2026-08-02', note: 'Candidat — non déployé' },
  { id: 'U-Net 0.9.0', kind: 'Segmentation', status: 'Retiré', date: '2025-09-12', note: 'Prototype initial' },
  { id: 'RF 0.9.2', kind: 'Classification', status: 'Retiré', date: '2025-09-12', note: 'Référence de départ' },
];

export const SEG_BY_SIZE = [
  { label: '< 0,5 ha', iou: 0.61, f1: 0.72, merge: 0.18 },
  { label: '0,5 – 2 ha', iou: 0.74, f1: 0.83, merge: 0.09 },
  { label: '> 2 ha', iou: 0.83, f1: 0.9, merge: 0.04 },
];

export const CLASS_METRICS = [
  { id: 'orge', precision: 0.86, recall: 0.81, f1: 0.83, support: 412 },
  { id: 'riz', precision: 0.93, recall: 0.95, f1: 0.94, support: 1180 },
  { id: 'haricot', precision: 0.74, recall: 0.69, f1: 0.71, support: 365 },
  { id: 'mais', precision: 0.8, recall: 0.78, f1: 0.79, support: 520 },
  { id: 'pomme_de_terre', precision: 0.78, recall: 0.74, f1: 0.76, support: 248 },
  { id: 'autre', precision: 0.58, recall: 0.52, f1: 0.55, support: 190 },
] as const;

export const CONF_LABELS = ['Orge', 'Riz', 'Haricot', 'Maïs', 'P. de terre', 'Autre'];
export const CONFUSION_MATRIX = [
  [334, 6, 21, 29, 8, 14],
  [3, 1121, 4, 38, 2, 12],
  [28, 7, 252, 41, 12, 25],
  [24, 31, 40, 406, 6, 13],
  [9, 3, 18, 16, 184, 18],
  [12, 8, 22, 28, 20, 100],
];

export const F1_BY_REGION = [
  { region: 'Vakinankaratra', f1: 0.81 },
  { region: 'Itasy', f1: 0.77 },
  { region: "Amoron'i Mania", f1: 0.74 },
  { region: 'Alaotra-Mangoro', f1: 0.69 },
  { region: 'Analamanga', f1: 0.75 },
];
