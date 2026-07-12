import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  fetchAnalytics,
  fetchIdea,
  fetchIdeas,
  fetchMe,
  type IdeaListItem,
  type MeUser,
  type UserAnalytics,
} from './api';
import { backButtonSupported, initData, showBackButton, startParam } from './telegram';
import { mockCabinet, mockResult, type EvalResult } from './mockData';
import CabinetScreen from './CabinetScreen';

// recharts тяжёлый — ReportScreen едет отдельным чанком, skeleton виден сразу.
const ReportScreen = lazy(() => import('./ReportScreen'));

type ErrorKind =
  | 'no-telegram' // открыто не из Telegram: initData пуст
  | 'unauthorized' // 401: initData протух (24 часа)
  | 'not-found' // 403/404: идея чужая или её нет
  | 'network'; // сеть / 5xx

type ReportState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: ErrorKind }
  | { phase: 'ready'; result: EvalResult; isMock: boolean };

interface CabinetData {
  me: MeUser;
  ideas: IdeaListItem[];
  analytics: UserAnalytics;
}

type CabinetState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: ErrorKind }
  | { phase: 'ready'; data: CabinetData };

/**
 * Экраны: кабинет (дефолт без ?idea=) и отчёт.
 * from: 'direct' — открыто по ссылке на идею (назад некуда),
 * 'cabinet' — из списка идей (назад — BackButton / «← Мои идеи»).
 */
type View =
  | { screen: 'cabinet' }
  | { screen: 'report'; from: 'direct' }
  | { screen: 'report'; from: 'cabinet'; ideaId: number };

/** Mock-режим: явный ?mock=1 или dev-сборка, открытая вне Telegram. */
function isMockMode(): boolean {
  if (new URLSearchParams(window.location.search).get('mock') === '1') return true;
  return (
    import.meta.env.DEV &&
    !initData() &&
    !isMockCabinet()
  );
}

/** ?mock=cabinet — образец кабинета (просмотр дизайна вне Telegram). */
function isMockCabinet(): boolean {
  return new URLSearchParams(window.location.search).get('mock') === 'cabinet';
}

/** ?idea= из query или start_param диплинка — открыть сразу отчёт. */
function directIdeaId(): string | null {
  return (
    new URLSearchParams(window.location.search).get('idea') ??
    startParam() ??
    null
  );
}

function errorKind(e: unknown): ErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'unauthorized';
    if (e.status === 403 || e.status === 404) return 'not-found';
  }
  return 'network';
}

export default function App() {
  // Точка входа определяется один раз: mock/?idea= → отчёт, иначе кабинет.
  const [view, setView] = useState<View>(() =>
    isMockMode() || directIdeaId() != null
      ? { screen: 'report', from: 'direct' }
      : { screen: 'cabinet' },
  );
  const [cabinet, setCabinet] = useState<CabinetState>({ phase: 'loading' });
  const [report, setReport] = useState<ReportState>({ phase: 'loading' });

  /* ── загрузчики ── */

  const loadDirectReport = useCallback(async () => {
    setReport({ phase: 'loading' });
    if (isMockMode()) {
      setReport({ phase: 'ready', result: mockResult, isMock: true });
      return;
    }
    if (!initData()) {
      setReport({ phase: 'error', kind: 'no-telegram' });
      return;
    }
    try {
      const result = await fetchIdea(directIdeaId()!);
      setReport({ phase: 'ready', result, isMock: false });
    } catch (e) {
      setReport({ phase: 'error', kind: errorKind(e) });
    }
  }, []);

  const loadCabinet = useCallback(async () => {
    setCabinet({ phase: 'loading' });
    if (isMockCabinet()) {
      setCabinet({ phase: 'ready', data: mockCabinet });
      return;
    }
    if (!initData()) {
      setCabinet({ phase: 'error', kind: 'no-telegram' });
      return;
    }
    try {
      const [me, ideas, analytics] = await Promise.all([
        fetchMe(),
        fetchIdeas(),
        fetchAnalytics(),
      ]);
      setCabinet({ phase: 'ready', data: { me, ideas, analytics } });
    } catch (e) {
      setCabinet({ phase: 'error', kind: errorKind(e) });
    }
  }, []);

  const openIdea = useCallback(async (ideaId: number) => {
    setView({ screen: 'report', from: 'cabinet', ideaId });
    setReport({ phase: 'loading' });
    if (isMockCabinet()) {
      setReport({ phase: 'ready', result: mockResult, isMock: true });
      return;
    }
    try {
      const result = await fetchIdea(ideaId);
      setReport({ phase: 'ready', result, isMock: false });
    } catch (e) {
      setReport({ phase: 'error', kind: errorKind(e) });
    }
  }, []);

  const goBack = useCallback(() => {
    setView({ screen: 'cabinet' });
  }, []);

  /* ── эффекты ── */

  // Первая загрузка по точке входа.
  useEffect(() => {
    if (view.screen === 'report' && view.from === 'direct') {
      void loadDirectReport();
    } else {
      void loadCabinet();
    }
    // намеренно один раз: точка входа не меняется в течение сессии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Нативный BackButton — только в отчёте, открытом из кабинета.
  const fromCabinet = view.screen === 'report' && view.from === 'cabinet';
  useEffect(() => {
    if (!fromCabinet) return;
    const cleanup = showBackButton(goBack);
    return cleanup ?? undefined;
  }, [fromCabinet, goBack]);

  // Смена экрана — всегда с начала страницы.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.screen]);

  /* ── рендер ── */

  // Фолбэк-навигация «← Мои идеи», если нативного BackButton нет.
  const backFallback =
    fromCabinet && !backButtonSupported() ? goBack : undefined;

  if (view.screen === 'cabinet') {
    if (cabinet.phase === 'loading') return <CabinetSkeleton />;
    if (cabinet.phase === 'error') {
      return (
        <ErrorScreen
          kind={cabinet.kind}
          context="cabinet"
          onRetry={loadCabinet}
        />
      );
    }
    return (
      <CabinetScreen
        me={cabinet.data.me}
        ideas={cabinet.data.ideas}
        analytics={cabinet.data.analytics}
        onOpenIdea={(id) => void openIdea(id)}
      />
    );
  }

  // view.screen === 'report'
  if (report.phase === 'loading') return <ReportSkeleton />;
  if (report.phase === 'error') {
    const retry =
      view.from === 'cabinet'
        ? () => void openIdea(view.ideaId)
        : loadDirectReport;
    return (
      <ErrorScreen
        kind={report.kind}
        context="report"
        onRetry={retry}
        onBack={backFallback}
      />
    );
  }
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportScreen
        result={report.result}
        isMock={report.isMock}
        onBack={backFallback}
      />
    </Suspense>
  );
}

/* ── Skeleton'ы: плашки на месте контента ── */

function Topbar({ mode }: { mode: string }) {
  return (
    <div className="topbar">
      <span className="brand">
        <span className="glyph" />
        HYPOSCORE
      </span>
      <span className="mode">{mode}</span>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="app">
      <Topbar mode="загрузка" />
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

function CabinetSkeleton() {
  return (
    <div className="app">
      <Topbar mode="кабинет" />
      <div className="skeleton" aria-hidden="true">
        <div className="sk sk-kicker" />
        <div className="sk sk-title" />
        <div className="sk sk-score" />
        <div className="sk sk-row" />
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
    note: 'Кабинет привязан к вашему аккаунту — запустите mini app из чата с ботом HypoScore.',
    retry: false,
  },
  unauthorized: {
    kicker: 'Сессия устарела',
    title: 'Переоткройте приложение',
    note: 'Telegram выдаёт доступ на 24 часа. Закройте окно и откройте кабинет из чата заново.',
    retry: false,
  },
  'not-found': {
    kicker: 'Отчёт недоступен',
    title: 'Идея не найдена',
    note: 'Такого разбора нет или он принадлежит другому аккаунту. Откройте отчёт из чата с ботом.',
    retry: false,
  },
  network: {
    kicker: 'Нет связи',
    title: 'Не получилось загрузить',
    note: 'Похоже, сеть моргнула или сервер занят. Попробуйте ещё раз.',
    retry: true,
  },
};

function ErrorScreen({
  kind,
  context,
  onRetry,
  onBack,
}: {
  kind: ErrorKind;
  context: 'cabinet' | 'report';
  onRetry: () => void;
  onBack?: () => void;
}) {
  const copy = ERROR_COPY[kind];
  return (
    <div className="app">
      <Topbar mode={context === 'cabinet' ? 'кабинет' : 'отчёт'} />
      {onBack && (
        <button type="button" className="backlink" onClick={onBack}>
          ← Мои идеи
        </button>
      )}
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
