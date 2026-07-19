import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  fetchAnalytics,
  fetchIdea,
  fetchIdeas,
  fetchMe,
  type IdeaListItem,
  type IdeasPage,
  type IdeasQuery,
  type MeUser,
  type TariffCurrent,
  type TariffOption,
  type UserAnalytics,
} from './api';
import { backButtonSupported, initData, showBackButton, startParam } from './telegram';
import { mockCabinet, mockResult, type EvalResult } from './mockData';
import CabinetScreen from './CabinetScreen';
import IdeasScreen from './IdeasScreen';
import { ARCHIVE_PAGE, useIdeasArchive } from './useIdeasArchive';

/** Сколько идей показываем в кабинете: топ по баллу, остальное — экран «Все идеи». */
const TOP_IDEAS = 10;

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
  /** null — бэкенд без тарифного контракта: блок тарифа не показываем. */
  tariff: TariffCurrent | null;
  /** [] — каталог тарифов недоступен: блок оплаты не показываем. */
  tariffs: TariffOption[];
  /** Топ-10 по баллу, а не весь список. */
  ideas: IdeaListItem[];
  /** Сколько идей всего — для подписи и кнопки «Все идеи (N)». */
  ideasTotal: number;
  analytics: UserAnalytics;
}

type CabinetState =
  | { phase: 'loading' }
  | { phase: 'error'; kind: ErrorKind }
  | { phase: 'ready'; data: CabinetData };

/**
 * Экраны: кабинет (дефолт без ?idea=), архив «Все идеи» и отчёт.
 * from: 'direct' — открыто по ссылке на идею (назад некуда),
 * иначе — экран, с которого пришли: туда и возвращает BackButton.
 */
type Parented = 'cabinet' | 'ideas';

type View =
  | { screen: 'cabinet' }
  | { screen: 'ideas' }
  | { screen: 'report'; from: 'direct' }
  | { screen: 'report'; from: Parented; ideaId: number };

/** Куда ведёт «назад»: null — возвращаться некуда (корневой экран/прямая ссылка). */
function parentOf(view: View): Parented | null {
  if (view.screen === 'ideas') return 'cabinet';
  if (view.screen === 'report' && view.from !== 'direct') return view.from;
  return null;
}

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

/**
 * Страница архива для mock-режима: бэка нет, поэтому те же поиск/сортировка/срез
 * считаются по демо-списку. Держит `?mock=cabinet` рабочим для просмотра дизайна.
 */
function mockIdeasPage(params: IdeasQuery): IdeasPage {
  const q = (params.q ?? '').trim().toLowerCase();
  const found = q
    ? mockCabinet.ideas.filter((i) => i.title.toLowerCase().includes(q))
    : mockCabinet.ideas.slice();
  found.sort((a, b) =>
    params.sort === 'score'
      ? (b.score ?? -1) - (a.score ?? -1)
      : b.updated.localeCompare(a.updated),
  );
  const offset = params.offset ?? 0;
  return {
    items: found.slice(offset, offset + (params.limit ?? ARCHIVE_PAGE)),
    total: found.length,
  };
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
  // Защёлка: архив не ходит в сеть, пока его не открыли, но однажды открытый
  // остаётся «живым» — уход в отчёт и возврат не сбрасывают поиск и подгруженное.
  const [archiveOpened, setArchiveOpened] = useState(false);

  // Источник страниц архива: в mock-режиме бэка нет — фильтруем демо-список на месте.
  const fetchArchivePage = useCallback(
    (params: IdeasQuery): Promise<IdeasPage> =>
      isMockCabinet()
        ? Promise.resolve(mockIdeasPage(params))
        : fetchIdeas(params),
    [],
  );
  const archive = useIdeasArchive(fetchArchivePage, archiveOpened);

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
      // Через тот же mockIdeasPage, что и архив: иначе mock показал бы весь список
      // без сортировки по баллу и не воспроизводил бы боевое поведение кабинета.
      const page = mockIdeasPage({ sort: 'score', limit: TOP_IDEAS });
      setCabinet({
        phase: 'ready',
        data: { ...mockCabinet, ideas: page.items, ideasTotal: page.total },
      });
      return;
    }
    if (!initData()) {
      setCabinet({ phase: 'error', kind: 'no-telegram' });
      return;
    }
    try {
      // Кабинету нужен только топ по баллу: полный список живёт на экране «Все идеи».
      // total из той же выдачи — им подписан вход в архив.
      const [meResp, page, analytics] = await Promise.all([
        fetchMe(),
        fetchIdeas({ sort: 'score', limit: TOP_IDEAS }),
        fetchAnalytics(),
      ]);
      setCabinet({
        phase: 'ready',
        data: {
          me: meResp.user,
          tariff: meResp.tariff,
          tariffs: meResp.tariffs,
          ideas: page.items,
          ideasTotal: page.total,
          analytics,
        },
      });
    } catch (e) {
      setCabinet({ phase: 'error', kind: errorKind(e) });
    }
  }, []);

  const openIdea = useCallback(async (ideaId: number, from: Parented = 'cabinet') => {
    setView({ screen: 'report', from, ideaId });
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
    // Функциональный setState: «назад» зависит от текущего экрана, а не от
    // замыкания — иначе из отчёта, открытого из архива, вернулись бы в кабинет.
    setView((v) => (parentOf(v) === 'ideas' ? { screen: 'ideas' } : { screen: 'cabinet' }));
  }, []);

  const openAll = useCallback(() => {
    setArchiveOpened(true);
    setView({ screen: 'ideas' });
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

  // Нативный BackButton — на любом экране, которому есть куда возвращаться.
  const parent = parentOf(view);
  useEffect(() => {
    if (!parent) return;
    const cleanup = showBackButton(goBack);
    return cleanup ?? undefined;
  }, [parent, goBack]);

  // Смена экрана — всегда с начала страницы.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.screen]);

  /* ── рендер ── */

  // Фолбэк-навигация «← Мои идеи», если нативного BackButton нет.
  const backFallback = parent && !backButtonSupported() ? goBack : undefined;

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
        tariff={cabinet.data.tariff}
        tariffs={cabinet.data.tariffs}
        ideas={cabinet.data.ideas}
        ideasTotal={cabinet.data.ideasTotal}
        analytics={cabinet.data.analytics}
        onOpenIdea={(id) => void openIdea(id, 'cabinet')}
        onOpenAll={openAll}
      />
    );
  }

  if (view.screen === 'ideas') {
    return (
      <IdeasScreen
        archive={archive}
        onOpenIdea={(id) => void openIdea(id, 'ideas')}
        onBack={goBack}
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
