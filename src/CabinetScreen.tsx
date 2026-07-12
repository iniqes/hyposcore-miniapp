import type { CSSProperties } from 'react';
import type { IdeaListItem, MeUser, UserAnalytics } from './api';

/** Цвет вердикта по баллу (та же семантика, что в отчёте). */
function verdictVar(score: number): string {
  if (score >= 8) return 'var(--v-strong)';
  if (score >= 6) return 'var(--v-good)';
  if (score >= 4) return 'var(--v-pivot)';
  return 'var(--v-no)';
}

/** Цвет по ярлыку вердикта (для распределения в сводке). */
function verdictColorByLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith('сильная')) return 'var(--v-strong)';
  if (l.startsWith('перспективно')) return 'var(--v-good)';
  if (l.startsWith('требует')) return 'var(--v-pivot)';
  if (l.startsWith('не рекомендуется')) return 'var(--v-no)';
  return 'var(--muted)';
}

/** Русский формат числа: 5.5 → «5,5». */
function ru(n: number): string {
  return String(n).replace('.', ',');
}

/** «1 версия», «3 версии», «7 версий». */
function versionsRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return `${n} версия`;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} версии`;
  return `${n} версий`;
}

/** «2026-07-09 18:12:00» → «9 июля» (с годом, если не текущий). */
function dateRu(s: string): string {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

interface Props {
  me: MeUser;
  ideas: IdeaListItem[];
  analytics: UserAnalytics;
  /** Тап по идее — открыть её отчёт. */
  onOpenIdea: (id: number) => void;
}

export default function CabinetScreen({ me, ideas, analytics, onOpenIdea }: Props) {
  const hasIdeas = ideas.length > 0;
  const verdictEntries = Object.entries(analytics.verdicts).sort(
    (a, b) => b[1] - a[1],
  );

  let secN = 0;
  const idx = () => String(++secN).padStart(2, '0');

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <span className="glyph" />
          HYPOSCORE
        </span>
        <span className="mode">кабинет</span>
      </div>

      {/* приветствие + сводка типографикой */}
      <header className="hero">
        <div className="kicker">Кабинет</div>
        <h1>{me.first_name ? `Привет, ${me.first_name}` : 'Ваш кабинет'}</h1>

        {hasIdeas && (
          <div className="statrow">
            <div className="stat">
              <div className="num">{analytics.ideas_count}</div>
              <div className="lab">
                {analytics.ideas_count === 1 ? 'идея' : 'идей'}
              </div>
            </div>
            <div className="stat">
              <div className="num">{analytics.versions_total}</div>
              <div className="lab">версий</div>
            </div>
            {analytics.score_avg != null && (
              <div className="stat">
                <div className="num">
                  {ru(analytics.score_avg)}
                  <small> /10</small>
                </div>
                <div className="lab">средний балл</div>
              </div>
            )}
            {analytics.score_max != null && (
              <div className="stat">
                <div className="num">
                  {ru(analytics.score_max)}
                  <small> /10</small>
                </div>
                <div className="lab">лучший</div>
              </div>
            )}
          </div>
        )}

        {analytics.last_updated && (
          <div className="meta">обновлено {dateRu(analytics.last_updated)}</div>
        )}
      </header>

      {hasIdeas ? (
        <>
          {/* список идей */}
          <section className="band">
            <div className="sec-head">
              <div className="sec-index">{idx()} · Идеи</div>
              <h2>Ваши разборы</h2>
              <p className="sec-note">
                Свежие сверху. Тап открывает полный отчёт: радар, критерии,
                риски и источники.
              </p>
            </div>
            <div className="idea-list">
              {ideas.map((idea) => (
                <div
                  key={idea.id}
                  className="idea-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenIdea(idea.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenIdea(idea.id);
                    }
                  }}
                >
                  <div
                    className={`score${idea.score == null ? ' na' : ''}`}
                    style={
                      idea.score != null
                        ? ({ color: verdictVar(idea.score) } as CSSProperties)
                        : undefined
                    }
                  >
                    {idea.score != null ? ru(idea.score) : '—'}
                  </div>
                  <div className="body">
                    <div className="t">{idea.title || 'Идея без названия'}</div>
                    <div className="m">
                      {[
                        idea.verdict,
                        dateRu(idea.updated),
                        idea.versions > 1 ? versionsRu(idea.versions) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <span className="arrow">→</span>
                </div>
              ))}
            </div>
          </section>

          {/* распределение вердиктов */}
          {verdictEntries.length > 0 && (
            <section className="band">
              <div className="sec-head">
                <div className="sec-index">{idx()} · Сводка</div>
                <h2>Вердикты по идеям</h2>
              </div>
              <div className="verdrow">
                {verdictEntries.map(([label, count]) => (
                  <div className="v" key={label}>
                    <span
                      className="dot"
                      style={{ background: verdictColorByLabel(label) }}
                    />
                    <span className="n">{count}</span>
                    <span className="l">{label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* тёплый пустой кабинет */
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">01 · Пока пусто</div>
            <h2>Здесь появятся ваши разборы</h2>
            <p className="sec-note">
              Пришлите идею боту обычным сообщением — аналитик разложит её по
              14 критериям, и отчёт появится в кабинете: балл, радар, риски и
              источники.
            </p>
          </div>
        </section>
      )}

      <footer className="foot">
        <span className="mono">HypoScore · Mini App</span>
        <span className="mono">кабинет · Агент 01</span>
      </footer>
    </div>
  );
}
