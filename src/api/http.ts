/** Helper fetch partagé : timeout, gestion d'erreurs JSON et en-têtes convenus. */
// API_BASE vient de Vite (import.meta.env dans le navigateur). Sous Node (tsx, tests),
// le script doit définir globalThis.__AGRI_ENV__ AVANT d'importer ce module.
const envLike: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  ?? (globalThis as unknown as { __AGRI_ENV__?: Record<string, string | undefined> }).__AGRI_ENV__
  ?? {};
export const API_BASE = envLike.VITE_MALTO_API_URL?.replace(/\/+$/, '') ?? '';

export async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  // Annulation externe possible (démontage de composant, changement de zone) : `init.signal`.
  const external = init.signal ?? null;
  const onAbort = () => ctrl.abort();
  if (external?.aborted) ctrl.abort();
  else external?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : null),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(`Malto ${res.status} ${res.statusText}${detail?.detail ? ` — ${detail.detail}` : ''}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (err) {
    if (external?.aborted) throw new Error(`Requête annulée : ${path}`);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Malto — délai dépassé sur ${path} (${timeoutMs / 1000}s).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}
