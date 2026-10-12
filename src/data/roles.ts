import { USERS } from './generate';
import type { Role } from '../types';
export { ROLES } from './constants';
export const USERS_BY_ROLE = Object.fromEntries(
  (['admin', 'analyste', 'terrain', 'lecteur', 'gestionnaire'] as Role[]).map((r) => [r, USERS.find((u) => u.role === r && u.active)!.name]),
) as Record<Role, string>;
