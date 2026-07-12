import type { CSSProperties } from 'react';
import type {
  IdeaListItem,
  MeUser,
  TariffCurrent,
  TariffOption,
  UserAnalytics,
} from './api';

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

/** «14 кредитов», «1 кредит», «2 кредита». */
function creditsRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return `${n} кредит`;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} кредита`;
  return `${n} кредитов`;
}

/** «1990» → «1 990 ₽» (неразрывный тонкий пробел из toLocaleString). */
function rub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
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

/* ── Команды бота: статичный справочник, сгруппирован по смыслу ── */

interface BotCommand {
  cmd: string;
  desc: string;
}

const COMMAND_GROUPS: { title: string; items: BotCommand[] }[] = [
  {
    title: 'Разбор идей',
    items: [
      { cmd: '/new', desc: 'отправить новую идею на разбор' },
      { cmd: '/ideas', desc: 'ваши идеи и их отчёты' },
      { cmd: '/app', desc: 'открыть отчёт в мини-аппе' },
      { cmd: '/demo', desc: 'посмотреть примеры готового разбора' },
      { cmd: '/method', desc: 'методика и критерии, по которым работает аналитик' },
    ],
  },
  {
    title: 'Тариф и лимиты',
    items: [
      { cmd: '/quota', desc: 'сколько осталось от недельного лимита' },
      { cmd: '/tariff', desc: 'тарифы и ранний доступ' },
    ],
  },
  {
    title: 'Сервис',
    items: [
      { cmd: '/start', desc: 'что за бот и с чего начать' },
      { cmd: '/help', desc: 'короткая шпаргалка: что умеет бот' },
      { cmd: '/feedback', desc: 'поделиться пожеланием или замечанием' },
      { cmd: '/privacy', desc: 'приватность и удаление данных' },
      { cmd: '/clear', desc: 'очистить окно чата — память разборов сохранится' },
    ],
  },
];

interface Props {
  me: MeUser;
  /** null — бэкенд ещё не отдаёт тариф: блок «Тариф и лимиты» скрыт. */
  tariff: TariffCurrent | null;
  /** Пустой массив — каталога нет: блок «Оплата» скрыт. */
  tariffs: TariffOption[];
  ideas: IdeaListItem[];
  analytics: UserAnalytics;
  /** Тап по идее — открыть её отчёт. */
  onOpenIdea: (id: number) => void;
}

export default function CabinetScreen({
  me,
  tariff,
  tariffs,
  ideas,
  analytics,
  onOpenIdea,
}: Props) {
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
            <div className="sec-index">{idx()} · Пока пусто</div>
            <h2>Здесь появятся ваши разборы</h2>
            <p className="sec-note">
              Пришлите идею боту обычным сообщением — аналитик разложит её по
              14 критериям, и отчёт появится в кабинете: балл, радар, риски и
              источники.
            </p>
          </div>
        </section>
      )}

      {/* команды сервиса — статичный справочник */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Команды</div>
          <h2>Команды сервиса</h2>
          <p className="sec-note">
            Всё управление — в чате с ботом: отправьте команду обычным
            сообщением.
          </p>
        </div>
        {COMMAND_GROUPS.map((group) => (
          <div className="cmd-group" key={group.title}>
            <div className="cmd-group-title mono">{group.title}</div>
            {group.items.map((c) => (
              <div className="cmd-row" key={c.cmd}>
                <span className="cmd">{c.cmd}</span>
                <span className="cmd-desc">{c.desc}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* тариф и лимиты — только если бэкенд отдал tariff */}
      {tariff && tariff.title && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Тариф</div>
            <h2>Тариф и лимиты</h2>
          </div>
          <div className="tariff-title">{tariff.title}</div>
          {tariff.credits_week == null ? (
            <p className="tariff-line">
              Разборы без недельного лимита — присылайте идеи, когда удобно.
            </p>
          ) : tariff.remaining != null ? (
            <>
              <p className="tariff-line">
                На этой неделе осталось{' '}
                <strong>{creditsRu(tariff.remaining)}</strong> из{' '}
                {tariff.credits_week}.
              </p>
              <div className="quota-track" aria-hidden="true">
                <div
                  className="quota-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        (tariff.remaining / tariff.credits_week) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="tariff-line">
              {creditsRu(tariff.credits_week)} в неделю.
            </p>
          )}
          {tariff.reset && dateRu(tariff.reset) && (
            <div className="tariff-reset mono">
              лимит обновится {dateRu(tariff.reset)}
            </div>
          )}
        </section>
      )}

      {/* оплата: каталог тарифов — только если бэкенд отдал tariffs */}
      {tariffs.length > 0 && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Оплата</div>
            <h2>Оплата</h2>
          </div>
          <div className="plan-list">
            {tariffs.map((plan) => (
              <div className="plan-row" key={plan.tier || plan.title}>
                <div className="plan-body">
                  <div className="plan-name">
                    {plan.title}
                    {tariff && plan.tier === tariff.tier && (
                      <span className="you">ваш тариф</span>
                    )}
                  </div>
                  <div className="plan-creds mono">
                    {plan.credits_week != null
                      ? `${creditsRu(plan.credits_week)} в неделю`
                      : 'безлимит'}
                  </div>
                  {plan.hint && <p className="plan-hint">{plan.hint}</p>}
                </div>
                <div className="plan-price">
                  {plan.price_rub > 0 ? (
                    <>
                      {rub(plan.price_rub)}
                      <small>/мес</small>
                    </>
                  ) : (
                    'бесплатно'
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="pay-note">
            Оплата проходит в чате бота: отправьте команду{' '}
            <span className="cmd-inline">/tariff</span> и выберите тариф.
            Платёж принимает ЮKassa, чек придёт на почту.
          </p>
        </section>
      )}

      <footer className="foot">
        <span className="mono">HypoScore · Mini App</span>
        <span className="mono">кабинет · Агент 01</span>
      </footer>
    </div>
  );
}
