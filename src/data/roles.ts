import type { Role } from '../types';
export { ROLES } from './constants';

/** Libellés affichés sur l'écran de connexion (sessions locales, pas de comptes fictifs). */
export const ROLE_SESSION_LABEL: Record<Role, string> = {
  admin: 'Session administrateur',
  analyste: 'Session analyste',
  terrain: 'Session agent de terrain',
  lecteur: 'Session lecteur',
  gestionnaire: 'Session gestionnaire',
};

/** Compatibilité avec Login.tsx : affiche le libellé de session plutôt qu'un faux nom. */
export const USERS_BY_ROLE = Object.fromEntries(
  (Object.keys(ROLE_SESSION_LABEL) as Role[]).map((r) => [r, ROLE_SESSION_LABEL[r]]),
) as Record<Role, string>;
