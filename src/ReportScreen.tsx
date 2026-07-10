import { useState, type CSSProperties } from 'react';
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
   Совпадают с theme.css и не зависят от темы. */
const GROUP_HEX: Record<CriterionGroup, string> = {
  A: '#C2790F',
  B: '#7A5AF8',
  C: '#0E9E83',
  D: '#E5484D',
  E: '#2AA0C4',
};

const ACCENT = '#2B2D33';

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

function groupOf(id: CriterionId): CriterionGroup {
  return id[0] as CriterionGroup;
}

interface Props {
  result: EvalResult;
  /** true — на экране образец данных (mock), а не живой отчёт. */
  isMock?: boolean;
}

export default function ReportScreen({ result, isMock = false }: Props) {
  const [openId, setOpenId] = useState<CriterionId | null>(null);

  const radarData = CRITERION_ORDER.map((id) => ({
    axis: id,
    score: result.criteria[id].score,
  }));

  // Баллы по группам (среднее внутри группы) для блока метрик.
  const groupScores = GROUPS.map((g) => {
    const ids = CRITERION_ORDER.filter((id) => groupOf(id) === g.id);
    const avg =
      ids.reduce((s, id) => s + result.criteria[id].score, 0) / ids.length;
    return { ...g, avg: Math.round(avg * 10) / 10 };
  });

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

      {/* герой */}
      <header className="hero">
        <div className="kicker">Отчёт · 14 критериев</div>
        <h1>{result.idea}</h1>

        <div
          className="scorebox"
          style={{ '--verdict': verdictVar(result.score_final) } as CSSProperties}
        >
          <div>
            <div className="panel-label">Итоговый балл</div>
            <div className="score-num">
              {ru(result.score_final)}
              <small>/10</small>
            </div>
            <span className="verdict-pill">{result.verdict.label}</span>
            <p className="verdict-action">{result.verdict.action}</p>
          </div>
          <div>
            <div className="panel-label">Уверенность</div>
            <p className="panel-text">
              <b>{result.confidence}</b> ·{' '}
              {result.mode === 'deep' ? 'с веб-данными' : 'без веб-данных'} ·{' '}
              {result.evidence_sources.length} источн.
            </p>
          </div>
        </div>
      </header>

      {/* радар */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">01 · Профиль по осям</div>
          <h2>Радар 14 критериев</h2>
          <p className="sec-note">
            Каждая ось окрашена в цвет своей группы. Чем дальше от центра — тем
            выше балл.
          </p>
        </div>

        <div className="radar-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(22,23,28,.16)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={<AxisTick />}
                tickLine={false}
              />
              <PolarRadiusAxis
                domain={[0, 10]}
                tickCount={6}
                tick={{ fontSize: 10, fill: '#6c6d77' }}
                axisLine={false}
                stroke="rgba(22,23,28,.16)"
              />
              <Radar
                dataKey="score"
                stroke={ACCENT}
                strokeWidth={2}
                fill={ACCENT}
                fillOpacity={0.12}
                dot={<RadarDot />}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="radar-legend">
          {GROUPS.map((g) => (
            <span className="lg" key={g.id}>
              <span
                className="sw"
                style={{ background: GROUP_HEX[g.id] }}
              />
              {g.id} · {g.title}
            </span>
          ))}
        </div>
      </section>

      {/* группы */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">02 · Баллы по группам</div>
          <h2>Где сильно, где проседает</h2>
        </div>
        <div className="metrics">
          {groupScores.map((g) => (
            <div
              className="metric"
              key={g.id}
              style={{ '--g': GROUP_HEX[g.id] } as CSSProperties}
            >
              <div className="num">{ru(g.avg)}</div>
              <div className="lab">
                {g.id} · {g.title}
              </div>
              <div className="w">вес {Math.round(g.weight * 100)}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* критерии — progressive disclosure */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">03 · Критерии крупным планом</div>
          <h2>Разбор по осям</h2>
          <p className="sec-note">
            Тап по карточке раскрывает обоснование, уверенность и источник.
          </p>
        </div>

        <div className="crit-list">
          {CRITERION_ORDER.map((id) => {
            const c = result.criteria[id];
            const open = openId === id;
            return (
              <article
                key={id}
                className={`crit${open ? ' open' : ''}`}
                style={{ '--g': GROUP_HEX[c.group] } as CSSProperties}
                onClick={() => setOpenId(open ? null : id)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(open ? null : id);
                  }
                }}
              >
                <div className="crit-head">
                  <div>
                    <div className="k">
                      {id} · {c.title}
                    </div>
                    {c.inverted && (
                      <span className="inverted">↑ выше = лучше</span>
                    )}
                  </div>
                  <span className="hint">{open ? 'свернуть' : 'тап'}</span>
                  <div className="big-num">
                    {c.score}
                    <small>/10</small>
                  </div>
                </div>

                {open && (
                  <div className="crit-detail">
                    <p>{c.rationale}</p>
                    <div className="crit-tags">
                      <span className="tag">уверенность: {c.confidence}</span>
                      {c.source && (
                        <span className="tag src">{c.source} ↗</span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* вердикт-баннер */}
      <section className="band">
        <div className="banner">
          <div className="k">Вердикт</div>
          <p>{result.verdict.action}</p>
        </div>
      </section>

      {/* риски */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">04 · Главные риски</div>
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

      {/* источники */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">05 · Источники</div>
          <h2>На чём основана оценка</h2>
        </div>
        {result.evidence_sources.length > 0 ? (
          <div className="srclist">
            {result.evidence_sources.map((s, i) => (
              <a
                key={i}
                href={s.url ?? '#'}
                target="_blank"
                rel="noreferrer"
              >
                {s.title}
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
        <span className="mono">HypoScore · Mini App «Отчёт»</span>
        <span className="mono">
          {isMock ? 'данные — образец (mock)' : 'разбор Агента 01 · HypoScore'}
        </span>
      </footer>
    </div>
  );
}

/* ── Кастомная подпись оси радара: id критерия в цвете группы ── */
interface TickProps {
  x?: number;
  y?: number;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value: string };
}
function AxisTick({ x, y, textAnchor, payload }: TickProps) {
  const id = (payload?.value ?? '') as CriterionId;
  const color = id ? GROUP_HEX[groupOf(id)] : ACCENT;
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dy={4}
      fill={color}
      fontSize={12}
      fontWeight={600}
      fontFamily="'JetBrains Mono', monospace"
    >
      {id}
    </text>
  );
}

/* ── Точка радара в цвете группы ── */
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { axis: string };
}
function RadarDot({ cx, cy, payload }: DotProps) {
  if (cx == null || cy == null) return null;
  const id = (payload?.axis ?? '') as CriterionId;
  const color = id ? GROUP_HEX[groupOf(id)] : ACCENT;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={color}
      stroke="#f6f4ee"
      strokeWidth={1}
    />
  );
}
