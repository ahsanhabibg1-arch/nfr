import 'server-only';
import { getPublishedArticlesByIds } from '../content';
import type { Article } from '../../types';

export function numProp(props: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = props[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function idListProp(props: Record<string, unknown>, key: string): string[] {
  const raw = props[key];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Hand-picked articles first (in picked order), then auto-fill up to `count`. */
export async function pickedThenAuto(
  props: Record<string, unknown>,
  count: number,
  auto: (need: number, excludeIds: string[]) => Promise<Article[]>,
): Promise<Article[]> {
  if (count <= 0) return [];
  const picked = (await getPublishedArticlesByIds(idListProp(props, 'featuredIds'))).slice(0, count);
  const need = count - picked.length;
  if (need <= 0) return picked;
  const fill = await auto(need, picked.map((a) => a.id));
  return [...picked, ...fill].slice(0, count);
}
