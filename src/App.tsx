import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, fetchIdea, fetchIdeas } from './api';
import { initData, startParam } from './telegram';
import { mockResult, type EvalResult } from './mockData';

// recharts тяжёлый — ReportScreen едет отдельным чанком, skeleton виден сразу.
const ReportScreen = lazy(() => import('./ReportScreen'));

type ErrorKind =
  | 'no-telegram' // открыто не из Telegram: initData пуст
  | 'unauthorized' // 401: initData протух (24 часа)
  | 'not-found' // 403/404: идея чужая или её нет
  | 'no-ideas' // список идей пуст
  | 'network'; // сеть / 5xx

type State =
  | { phase: 'loading' }
  | { phase: 'error'; kind: ErrorKind }
  | { phase: 'ready'; result: EvalResult; isMock: boolean };

/** Mock-режим: явный ?mock=1 или dev-сборка, открытая вне Telegram. */
function isMockMode(): boolean {
  if (new URLSearchParams(window.location.search).get('mock') === '1') return true;
  return import.meta.env.DEV && !initData();
}

function errorKind(e: unknown): ErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'unauthorized';
    if (e.status === 403 || e.status === 404) return 'not-found';
  }
  return 'network';
}

/**
 * Корневой компонент Mini App: конечный автомат loading → error | ready.
 * Какую идею показывать: ?idea= из query → start_param → последняя из /api/ideas.
 */
export default function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });

    if (isMockMode()) {
      setState({ phase: 'ready', result: mockResult, isMock: true });
      return;
    }
    if (!initData()) {
      setState({ phase: 'error', kind: 'no-telegram' });
      return;
    }

    try {
      let id: string | number | null =
        new URLSearchParams(window.location.search).get('idea') ??
        startParam() ??
        null;

      if (id == null) {
        const ideas = await fetchIdeas();
        if (ideas.length === 0) {
          setState({ phase: 'error', kind: 'no-ideas' });
          return;
        }
        id = ideas[0].id;
      }

      const result = await fetchIdea(id);
      setState({ phase: 'ready', result, isMock: false });
    } catch (e) {
      setState({ phase: 'error', kind: errorKind(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === 'loading') return <SkeletonScreen />;
  if (state.phase === 'error') {
    return <ErrorScreen kind={state.kind} onRetry={load} />;
  }
  return (
    <Suspense fallback={<SkeletonScreen />}>
      <ReportScreen result={state.result} isMock={state.isMock} />
    </Suspense>
  );
}

/* ── Skeleton: серые плашки на месте балла, радара и критериев ── */

function SkeletonScreen() {
  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <span className="glyph" />
          HYPOSCORE
        </span>
        <span className="mode">загрузка</span>
      </div>
      <div className="skeleton" aria-hidden="true">
        <div className="sk sk-kicker" />
        <div className="sk sk-title" />
        <div className="sk sk-score" />
        <div className="sk sk-radar" />
        <div className="sk sk-row" />
        <div className="sk sk-row" />
        <div className="sk sk-row" />
        <div className="sk sk-row" />
      </div>
    </div>
  );
}

/* ── Экраны ошибок ── */

interface ErrorCopy {
  kicker: string;
  title: string;
  note: string;
  /** Показывать ли кнопку «Повторить». */
  retry: boolean;
}

const ERROR_COPY: Record<ErrorKind, ErrorCopy> = {
  'no-telegram': {
    kicker: 'Нужен Telegram',
    title: 'Откройте приложение через Telegram',
    note: 'Отчёт привязан к вашему аккаунту — запустите mini app из чата с ботом HypoScore.',
    retry: false,
  },
  unauthorized: {
    kicker: 'Сессия устарела',
    title: 'Переоткройте приложение',
    note: 'Telegram выдаёт доступ на 24 часа. Закройте окно и откройте отчёт из чата заново.',
    retry: false,
  },
  'not-found': {
    kicker: 'Отчёт недоступен',
    title: 'Идея не найдена',
    note: 'Такого разбора нет или он принадлежит другому аккаунту. Откройте отчёт из чата с ботом.',
    retry: false,
  },
  'no-ideas': {
    kicker: 'Пока пусто',
    title: 'Здесь появится ваш отчёт',
    note: 'Пришлите идею боту — и здесь появится отчёт: балл, радар по 14 критериям и главные риски.',
    retry: false,
  },
  network: {
    kicker: 'Нет связи',
    title: 'Не получилось загрузить отчёт',
    note: 'Похоже, сеть моргнула или сервер занят. Попробуйте ещё раз.',
    retry: true,
  },
};

function ErrorScreen({
  kind,
  onRetry,
}: {
  kind: ErrorKind;
  onRetry: () => void;
}) {
  const copy = ERROR_COPY[kind];
  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <span className="glyph" />
          HYPOSCORE
        </span>
      </div>
      <div className="state">
        <div className="kicker">{copy.kicker}</div>
        <h1>{copy.title}</h1>
        <p className="state-note">{copy.note}</p>
        {copy.retry && (
          <button type="button" className="btn" onClick={onRetry}>
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}
