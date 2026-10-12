/**
 * Couche « API » simulée. Chaque fonction correspond à une route du cahier des charges (§13)
 * et renvoie une Promise avec une latence artificielle. Pour brancher le vrai backend FastAPI,
 * il suffit de réimplémenter ces fonctions avec fetch() — l'UI n'a pas à changer.
 */
import { buildDb, type FakeDb } from '../data/generate';

let db: FakeDb | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  /** GET /api/regions + /api/communes + /api/parcelles (le prototype charge tout d'un coup) */
  async bootstrap(): Promise<FakeDb> {
    await wait(450);
    return (db ??= buildDb());
  },
  /** POST /api/exports — renvoie quand le « fichier » est prêt */
  async createExport(_format: string): Promise<{ id: string }> {
    await wait(700);
    return { id: `EX-${Date.now().toString(36).toUpperCase()}` };
  },
  /** POST /api/parcelles/{id}/signalements */
  async reportParcel(_id: string, _message: string): Promise<void> {
    await wait(400);
  },
};
