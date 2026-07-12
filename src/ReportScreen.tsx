import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  CRITERION_ORDER,
  GROUPS,
  type CriterionGroup,
  type CriterionId,
  type EvalResult,
} from './mockData';

/* Конкретные hex-цвета для Recharts (SVG требует реальные цвета).
   Марки (точки, полигон) — фирменные цвета групп. */
const GROUP_HEX: Record<CriterionGroup, string> = {
  A: '#C2790F',
  B: '#7A5AF8',
  C: '#0E9E83',
  D: '#E5484D',
  E: '#2AA0C4',
};

/* Те же цвета как ТЕКСТ: на белом слегка затемнены чернилами (≥3.9:1),
   в тёмной теме — чистые. Синхронно с --gmix в theme.css. */
const GROUP_TEXT_HEX_LIGHT: Record<CriterionGroup, string> = {
  A: '#A36711',
  B: '#684ED0',
  C: '#0F8670',
  D: '#C03F44',
  E: '#2687A6',
};

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

function groupTextHex(g: CriterionGroup): string {
  return isDarkTheme() ? GROUP_HEX[g] : GROUP_TEXT_HEX_LIGHT[g];
}

/** Цвет вердикта по баллу (семантика, не меняется). */
function verdictVar(score: number): string {
  if (score >= 8) return 'var(--v-strong)';
  if (score >= 6) return 'var(--v-good)';
  if (score >= 4) return 'var(--v-pivot)';
  return 'var(--v-no)';
}

/** Русский формат числа: 5.5 → «5,5». */
function ru(n: number): string {
  return String(n).replace('.', ',');
}

/** «3 источника», «5 источников». */
function sourcesRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return `${n} источник`;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} источника`;
  return `${n} источников`;
}

function groupOf(id: CriterionId): CriterionGroup {
  return id[0] as CriterionGroup;
}

interface Props {
  result: EvalResult;
  /** true — на экране образец данных (mock), а не живой отчёт. */
  isMock?: boolean;
  /**
   * Вернуться в кабинет. Передаётся, только когда нативный BackButton
   * недоступен — тогда рисуем текстовую кнопку «← Мои идеи».
   */
  onBack?: () => void;
}

export default function ReportScreen({ result, isMock = false, onBack }: Props) {
  const [flashId, setFlashId] = useState<CriterionId | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => window.clearTimeout(flashTimer.current),
    [],
  );

  /** Тап по вершине/подписи радара: плавный скролл к критерию + подсветка. */
  const goToCriterion = useCallback((id: CriterionId) => {
    document
      .getElementById(`crit-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(null); // сброс, чтобы анимация перезапустилась
    requestAnimationFrame(() => setFlashId(id));
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 2000);
  }, []);

  const radarData = CRITERION_ORDER.map((id) => ({
    axis: id,
    score: result.criteria[id].score,
  }));

  // Баллы по группам (среднее внутри группы).
  const groupScores = GROUPS.map((g) => {
    const ids = CRITERION_ORDER.filter((id) => groupOf(id) === g.id);
    const avg =
      ids.reduce((s, id) => s + result.criteria[id].score, 0) / ids.length;
    return { ...g, avg: Math.round(avg * 10) / 10 };
  });

  const accentHex = isDarkTheme() ? '#C9CAD2' : '#2B2D33';
  const gridStroke = isDarkTheme()
    ? 'rgba(237,235,227,.18)'
    : 'rgba(22,23,28,.14)';

  // Сквозная нумерация секций (часть блоков условная).
  let secN = 0;
  const idx = () => String(++secN).padStart(2, '0');

  return (
    <div className="app">
      {/* topbar */}
      <div className="topbar">
        <span className="brand">
          <span className="glyph" />
          HYPOSCORE
        </span>
        <span className="mode">
          {result.mode === 'deep' ? 'глубокий разбор' : 'экспресс-разбор'}
        </span>
      </div>

      {onBack && (
        <button type="button" className="backlink" onClick={onBack}>
          ← Мои идеи
        </button>
      )}

      {/* герой: балл и вердикт — типографикой */}
      <header className="hero">
        <div className="kicker">Отчёт · 14 критериев</div>
        <h1>{result.idea}</h1>

        <div
          className="scoreblock"
          style={{ '--verdict': verdictVar(result.score_final) } as CSSProperties}
        >
          <div className="score-num">
            {ru(result.score_final)}
            <small> /10</small>
          </div>
          <div className="verdict-label">{result.verdict.label}</div>
          {result.verdict.action && (
            <p className="verdict-action">{result.verdict.action}</p>
          )}
        </div>

        <div className="meta">
          уверенность {result.confidence} ·{' '}
          {result.mode === 'deep' ? 'с веб-данными' : 'без веб-данных'}
          {result.evidence_sources.length > 0 &&
            ` · ${sourcesRu(result.evidence_sources.length)}`}
        </div>
      </header>

      {/* почему балл срезан — только в аппе */}
      {result.killers.length > 0 && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Ограничение балла</div>
            <h2>Почему балл срезан</h2>
            <p className="sec-note">
              Методика ограничивает итог, когда находит критичный провал —
              сильные стороны его не компенсируют.
            </p>
          </div>
          <div className="cutlist">
            {result.killers.map((k, i) => (
              <div className="t" key={i}>
                <span className="dot" />
                <p>{k}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* радар */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Профиль по осям</div>
          <h2>Радар 14 критериев</h2>
          <p className="sec-note">
            Чем дальше от центра — тем выше балл. Тап по вершине или подписи
            оси ведёт к разбору критерия.
          </p>
        </div>

        <div className="radar-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis
                dataKey="axis"
                tick={<AxisTick onSelect={goToCriterion} />}
                tickLine={false}
              />
              <PolarRadiusAxis
                domain={[0, 10]}
                tickCount={6}
                tick={{ fontSize: 10, fill: isDarkTheme() ? '#8a8b93' : '#71727b' }}
                axisLine={false}
                stroke={gridStroke}
              />
              <Radar
                dataKey="score"
                stroke={accentHex}
                strokeWidth={2}
                fill={accentHex}
                fillOpacity={0.1}
                dot={<RadarDot onSelect={goToCriterion} />}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="radar-legend">
          {GROUPS.map((g) => (
            <span className="lg" key={g.id}>
              <span className="sw" style={{ background: GROUP_HEX[g.id] }} />
              {g.id} · {g.title}
            </span>
          ))}
        </div>
      </section>

      {/* группы — строки, не плитки */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Баллы по группам</div>
          <h2>Где сильно, где проседает</h2>
        </div>
        <div className="groups">
          {groupScores.map((g) => (
            <div
              className="group-row"
              key={g.id}
              style={{ '--g': GROUP_HEX[g.id] } as CSSProperties}
            >
              <div className="num gtext">{ru(g.avg)}</div>
              <div className="lab">
                <span className="code">{g.id}</span>
                {g.title}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* критерии — развёрнутый разбор, без обрезков */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Критерии крупным планом</div>
          <h2>Разбор по осям</h2>
          <p className="sec-note">
            Балл и обоснование по каждой из 14 осей — здесь всё целиком.
          </p>
        </div>

        <div className="crit-list">
          {CRITERION_ORDER.map((id) => {
            const c = result.criteria[id];
            return (
              <article
                key={id}
                id={`crit-${id}`}
                className={`crit${flashId === id ? ' flash' : ''}`}
                style={{ '--g': GROUP_HEX[c.group] } as CSSProperties}
              >
                <div className="crit-head">
                  <div>
                    <div className="code gtext">
                      {id}
                      {c.inverted && (
                        <span className="inverted">↑ выше = лучше</span>
                      )}
                    </div>
                    <h3>{c.title}</h3>
                  </div>
                  <div className="big-num gtext">
                    {c.score}
                    <small>/10</small>
                  </div>
                </div>

                <p className="crit-rationale">{c.rationale}</p>
                <div className="crit-meta">
                  уверенность: {c.confidence}
                  {c.source && (
                    <>
                      {' · '}
                      <span className="src">{c.source}</span>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* вердикт-баннер (фирменная плашка серии) */}
      <section className="band">
        <div className="banner">
          <div className="k">Вердикт</div>
          <p>{result.verdict.action || result.verdict.label}</p>
        </div>
      </section>

      {/* риски */}
      {result.red_team.length > 0 && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Главные риски</div>
            <h2>Что убьёт, если не закрыть</h2>
          </div>
          <div className="tezis">
            {result.red_team.map((risk, i) => (
              <div className="t" key={i}>
                <span className="dot" />
                <p>{risk}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* допущения разбора — только в аппе */}
      {result.assumptions.length > 0 && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Допущения разбора</div>
            <h2>Что принято на веру</h2>
            <p className="sec-note">
              Чего не хватило в данных — и как это учтено в оценке.
            </p>
          </div>
          <div className="assumptions">
            {result.assumptions.map((a, i) => (
              <div className="t" key={i}>
                <span className="dot" />
                <p>{a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* источники */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Источники</div>
          <h2>На чём основана оценка</h2>
        </div>
        {result.evidence_sources.length > 0 ? (
          <div className="srclist">
            {result.evidence_sources.map((s, i) => (
              <a key={i} href={s.url ?? '#'} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
            ))}
          </div>
        ) : (
          <p className="sec-note">
            Экспресс-разбор идёт без веб-поиска — источники появятся в глубоком
            режиме.
          </p>
        )}
      </section>

      <footer className="foot">
        <span className="mono">HypoScore · Mini App</span>
        <span className="mono">
          {isMock ? 'данные — образец (mock)' : 'разбор Агента 01 · HypoScore'}
        </span>
      </footer>
    </div>
  );
}

/* ── Подпись оси радара: id критерия в цвете группы, кликабельная ── */
interface TickProps {
  x?: number;
  y?: number;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value: string };
  onSelect?: (id: CriterionId) => void;
}
function AxisTick({ x, y, textAnchor, payload, onSelect }: TickProps) {
  const id = (payload?.value ?? '') as CriterionId;
  if (!id || x == null || y == null) return null;
  return (
    <g
      onClick={() => onSelect?.(id)}
      style={{ cursor: 'pointer' }}
      role="link"
      aria-label={`к критерию ${id}`}
    >
      {/* невидимая зона тапа под палец (~40px) */}
      <circle cx={x} cy={y} r={20} fill="transparent" />
      <text
        x={x}
        y={y}
        textAnchor={textAnchor}
        dy={4}
        fill={groupTextHex(groupOf(id))}
        fontSize={13}
        fontWeight={600}
        fontFamily="'JetBrains Mono', monospace"
      >
        {id}
      </text>
    </g>
  );
}

/* ── Точка радара в цвете группы, кликабельная ── */
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { axis: string };
  onSelect?: (id: CriterionId) => void;
}
function RadarDot({ cx, cy, payload, onSelect }: DotProps) {
  if (cx == null || cy == null) return null;
  const id = (payload?.axis ?? '') as CriterionId;
  const color = id ? GROUP_HEX[groupOf(id)] : '#2B2D33';
  return (
    <g
      onClick={() => id && onSelect?.(id)}
      style={{ cursor: 'pointer' }}
    >
      {/* невидимая зона тапа под палец */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke={isDarkTheme() ? '#16171c' : '#ffffff'}
        strokeWidth={1.5}
      />
    </g>
  );
}
