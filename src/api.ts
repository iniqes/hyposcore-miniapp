// Слой API: запросы к бэку agent01-webapi + адаптер контракта → типы фронта.
// Авторизация — только заголовок `Authorization: tma <initData>`,
// initData НИКОГДА не передаём в query (попадает в access-логи).

import {
  CRITERION_ORDER,
  type ConfidenceLevel,
  type Criterion,
  type CriterionGroup,
  type CriterionId,
  type EvalResult,
  type EvidenceSource,
} from './mockData';
import { initData } from './telegram';

const BASE: string = import.meta.env.VITE_API_BASE;

/** Ошибка API с HTTP-статусом — по нему App выбирает экран (401/403/404/5xx). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`API ответил ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  // credentials не задаём (куки не используем — иначе CORS с '*' срежет запрос).
  const res = await fetch(BASE + path, {
    headers: { Authorization: 'tma ' + initData() },
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

/* ── Метаданные критериев ────────────────────────────────────
   Источник истины — рубрика бэка config/methodology/rubric_v1.yaml.
   Для inverted-критериев (B3, C1, D1, E1) взято поле display. */
const CRITERIA_META: Record<CriterionId, { title: string; inverted: boolean }> = {
  A1: { title: 'Острота проблемы / потенциал спроса', inverted: false },
  A2: { title: 'Объём рынка (TAM/SAM/SOM)', inverted: false },
  A3: { title: 'Тайминг — почему сейчас (why now)', inverted: false },
  A4: { title: 'Фрагментированность рынка', inverted: false },
  B1: { title: 'Конкурентная плотность', inverted: false },
  B2: { title: 'Защищённость от копирования (moat)', inverted: false },
  B3: { title: 'Лёгкость входа на рынок', inverted: true },
  B4: { title: 'Вирусное распространение (виральность)', inverted: false },
  C1: { title: 'Простота реализации', inverted: true },
  C2: { title: 'Соответствие команды рынку (founder-market fit)', inverted: false },
  C3: { title: 'Монетизационный потенциал', inverted: false },
  D1: { title: 'Регуляторная безопасность', inverted: true },
  E1: { title: 'Независимость от базовых AI-моделей', inverted: true },
  E2: { title: 'Барьер на данных (data moat)', inverted: false },
};

/* ── Сырой контракт GET /api/idea/{id} (asdict от EvalResult бэка) ── */

interface RawCriterion {
  score?: number;
  rationale?: string;
  confidence?: string;
  source?: string | null;
}

interface RawEvidenceRef {
  url?: string;
  title?: string;
  snippet?: string;
}

interface RawResult {
  criteria?: Record<string, RawCriterion>;
  score_final?: number;
  verdict?: { label?: string; action?: string };
  title?: string;
  confidence?: string;
  red_team?: string[];
  evidence_sources?: string[];
  evidence_refs?: RawEvidenceRef[];
  mode?: string;
  /** id сработавших киллер-ограничений методики (D1_low, A1_low, copyable…). */
  applied_killers?: string[];
  /** Допущения разбора: чего не хватило в данных. */
  assumptions?: string[];
}

/* Человеческие формулировки киллеров — по rubric_v1.yaml бэка
   (внутренности методики — id и потолки — наружу не отдаём). */
const KILLER_LABELS: Record<string, string> = {
  D1_low:
    'Критичный юридический риск: без юридической проработки идею двигать нельзя.',
  A1_low: 'Спрос не подтверждён: нет живой боли — нет продукта.',
  copyable: 'Продукт легко копируется, защитного барьера нет.',
};

const KILLER_FALLBACK =
  'Разбор нашёл критичный провал — итоговый балл ограничен.';

export interface IdeaResponse {
  id: number;
  title?: string;
  text?: string;
  version_count?: number;
  result?: RawResult;
}

/** Элемент списка GET /api/ideas. */
export interface IdeaListItem {
  id: number;
  title: string;
  score: number | null;
  verdict: string;
  versions: number;
  updated: string;
}

const CONFIDENCE_LEVELS: readonly string[] = ['высокая', 'средняя', 'низкая'];

function toConfidence(value: string | undefined): ConfidenceLevel {
  return value && CONFIDENCE_LEVELS.includes(value)
    ? (value as ConfidenceLevel)
    : 'низкая';
}

/**
 * Адаптер контракта бэка → EvalResult фронта:
 * title → idea, evidence_refs → источники, названия/inverted — из рубрики,
 * дефолты для недостающих критериев (ReportScreen не должен падать).
 */
export function toEvalResult(data: IdeaResponse): EvalResult {
  const r = data.result ?? {};

  const criteria = {} as Record<CriterionId, Criterion>;
  for (const id of CRITERION_ORDER) {
    const raw = r.criteria?.[id];
    criteria[id] = {
      title: CRITERIA_META[id].title,
      score: raw?.score ?? 0,
      rationale: raw?.rationale ?? '—',
      confidence: toConfidence(raw?.confidence),
      source: raw?.source ?? undefined,
      group: id[0] as CriterionGroup,
      inverted: CRITERIA_META[id].inverted,
    };
  }

  // Источники: приоритет — аннотированные evidence_refs, фолбэк — голые URL.
  const refs = r.evidence_refs ?? [];
  const evidence_sources: EvidenceSource[] =
    refs.length > 0
      ? refs.map((ref) => ({ title: ref.title || ref.url || 'источник', url: ref.url }))
      : (r.evidence_sources ?? []).map((url) => ({ title: url, url }));

  return {
    idea: data.title || r.title || 'Идея без названия',
    score_final: r.score_final ?? 0,
    verdict: {
      label: r.verdict?.label ?? '—',
      action: r.verdict?.action ?? '',
    },
    mode: r.mode === 'deep' ? 'deep' : 'express',
    confidence: toConfidence(r.confidence),
    criteria,
    red_team: r.red_team ?? [],
    evidence_sources,
    killers: (r.applied_killers ?? []).map(
      (id) => KILLER_LABELS[id] ?? KILLER_FALLBACK,
    ),
    assumptions: (r.assumptions ?? []).filter(
      (a) => typeof a === 'string' && a.trim() !== '',
    ),
  };
}

/** Отчёт по идее: GET /api/idea/{id} → EvalResult фронта. */
export async function fetchIdea(id: string | number): Promise<EvalResult> {
  const data = await apiGet<IdeaResponse>(`/api/idea/${id}`);
  return toEvalResult(data);
}

/** Список идей пользователя (свежие первыми): GET /api/ideas. */
export async function fetchIdeas(): Promise<IdeaListItem[]> {
  const data = await apiGet<{ ideas?: IdeaListItem[] }>('/api/ideas');
  return data.ideas ?? [];
}

/* ── Кабинет: /api/me и /api/analytics ───────────────────── */

/** Пользователь из GET /api/me (по валидному initData). */
export interface MeUser {
  id: number;
  first_name: string;
  username: string;
}

/** Сводка GET /api/analytics: количество идей, баллы, вердикты. */
export interface UserAnalytics {
  ideas_count: number;
  versions_total: number;
  score_avg: number | null;
  score_max: number | null;
  score_min: number | null;
  /** Распределение вердиктов: ярлык → сколько идей. */
  verdicts: Record<string, number>;
  last_updated: string | null;
}

/** Кто открыл кабинет: GET /api/me. */
export async function fetchMe(): Promise<MeUser> {
  const data = await apiGet<{ user?: Partial<MeUser> }>('/api/me');
  const u = data.user ?? {};
  return {
    id: u.id ?? 0,
    first_name: u.first_name ?? '',
    username: u.username ?? '',
  };
}

/** Персональная сводка для кабинета: GET /api/analytics. */
export async function fetchAnalytics(): Promise<UserAnalytics> {
  const data = await apiGet<Partial<UserAnalytics>>('/api/analytics');
  return {
    ideas_count: data.ideas_count ?? 0,
    versions_total: data.versions_total ?? 0,
    score_avg: data.score_avg ?? null,
    score_max: data.score_max ?? null,
    score_min: data.score_min ?? null,
    verdicts: data.verdicts ?? {},
    last_updated: data.last_updated ?? null,
  };
}
