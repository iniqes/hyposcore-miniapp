// Состояние экрана «Все идеи»: поиск, сортировка, подгрузка страниц.
//
// Живёт в App, а не внутри IdeasScreen: пользователь уходит в отчёт и возвращается —
// найденное и подгруженное должно остаться на месте, а IdeasScreen при этом
// размонтируется. Поэтому же экран остаётся презентационным.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IdeaListItem, IdeasPage, IdeasQuery, IdeasSort } from './api';

/** Размер страницы архива: заметно больше топ-10, но не «вся база» одним запросом. */
export const ARCHIVE_PAGE = 20;

/** Пауза перед запросом при наборе — чтобы не слать запрос на каждую букву. */
const DEBOUNCE_MS = 300;

export type ArchivePhase = 'loading' | 'ready' | 'error';

export interface IdeasArchive {
  /** Сырой ввод поля поиска (обновляется мгновенно, запрос — с задержкой). */
  query: string;
  sort: IdeasSort;
  items: IdeaListItem[];
  /** Сколько всего идей под текущим фильтром. */
  total: number;
  phase: ArchivePhase;
  /** Идёт подгрузка следующей страницы (список уже показан). */
  loadingMore: boolean;
  /** Есть ли что подгружать дальше. */
  hasMore: boolean;
  setQuery: (q: string) => void;
  setSort: (s: IdeasSort) => void;
  loadMore: () => void;
  reload: () => void;
}

/**
 * @param fetchPage источник страниц — реальный API или mock-резолвер (App решает).
 * @param enabled  false, пока архив не нужен: не ходим в сеть до открытия экрана.
 */
export function useIdeasArchive(
  fetchPage: (params: IdeasQuery) => Promise<IdeasPage>,
  enabled: boolean,
): IdeasArchive {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<IdeasSort>('fresh');
  const [items, setItems] = useState<IdeaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<ArchivePhase>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  /** Ручной триггер повтора после ошибки (менять значение — значит перезапросить). */
  const [attempt, setAttempt] = useState(0);

  // Гонка ответов: медленный запрос за «мар» не должен перезаписать быстрый за
  // «маркет». Живым считаем только ответ с последним номером.
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Смена фильтра/сортировки — всегда с первой страницы.
  useEffect(() => {
    if (!enabled) return;
    const id = ++reqId.current;
    setPhase('loading');
    void (async () => {
      try {
        const page = await fetchPage({
          limit: ARCHIVE_PAGE,
          offset: 0,
          q: debounced,
          sort,
        });
        if (id !== reqId.current) return; // ответ устарел
        setItems(page.items);
        setTotal(page.total);
        setPhase('ready');
      } catch {
        if (id !== reqId.current) return;
        setPhase('error');
      }
    })();
  }, [enabled, debounced, sort, attempt, fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || phase !== 'ready' || items.length >= total) return;
    const id = reqId.current; // не инкрементим: догрузка не отменяет текущий фильтр
    setLoadingMore(true);
    void (async () => {
      try {
        const page = await fetchPage({
          limit: ARCHIVE_PAGE,
          offset: items.length,
          q: debounced,
          sort,
        });
        if (id !== reqId.current) return; // фильтр сменился, пока грузили
        // Дозапись, а не замена: страница дописывается к уже показанному.
        setItems((prev) => [...prev, ...page.items]);
        setTotal(page.total);
      } catch {
        // Ошибка догрузки не рушит уже показанный список — просто не растём.
      } finally {
        if (id === reqId.current) setLoadingMore(false);
      }
    })();
  }, [loadingMore, phase, items.length, total, debounced, sort, fetchPage]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    query,
    sort,
    items,
    total,
    phase,
    loadingMore,
    hasMore: items.length < total,
    setQuery,
    setSort,
    loadMore,
    reload,
  };
}
