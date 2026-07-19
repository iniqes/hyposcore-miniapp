import type {
  IdeaListItem,
  MeUser,
  TariffCurrent,
  TariffOption,
  UserAnalytics,
} from './api';
import IdeaRow, { dateRu, ru } from './IdeaRow';
import { openBotCommand, referralsEnabled, inviteLink, shareInvite } from './telegram';

/** Текст-подводка к ссылке при нажатии «Поделиться» (голос бота — живо, без канцелярита). */
const INVITE_SHARE_TEXT =
  'Проверяю идеи в HypoScore — честный разбор рынка, конкурентов и рисков. Попробуй:';

/** Цвет по ярлыку вердикта (для распределения в сводке). */
function verdictColorByLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith('сильная')) return 'var(--v-strong)';
  if (l.startsWith('перспективно')) return 'var(--v-good)';
  if (l.startsWith('требует')) return 'var(--v-pivot)';
  if (l.startsWith('не рекомендуется')) return 'var(--v-no)';
  return 'var(--muted)';
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

/* ── Команды бота: статичный справочник, сгруппирован по смыслу ── */

interface BotCommand {
  cmd: string;
  desc: string;
}

/** Команды, которые бот умеет принимать deep-link'ом ?start=cmd_<имя>. */
const DEEPLINK_CMDS = new Set([
  'start',
  'help',
  'demo',
  'method',
  'ideas',
  'new',
  'quota',
  'tariff',
  'invite',
  'feedback',
  'privacy',
  'app',
]);

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
      // «Пригласить друга» вынесено в отдельный блок-экран (ниже, под флагом рефералов),
      // поэтому строкой-командой здесь не дублируем.
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
  /** Топ идей по баллу (не весь список) — кабинет не должен расти бесконечно. */
  ideas: IdeaListItem[];
  /** Сколько идей всего: и для подписи, и для кнопки перехода в архив. */
  ideasTotal: number;
  analytics: UserAnalytics;
  /** Тап по идее — открыть её отчёт. */
  onOpenIdea: (id: number) => void;
  /** Открыть экран «Все идеи» — полный архив с поиском. */
  onOpenAll: () => void;
}

export default function CabinetScreen({
  me,
  tariff,
  tariffs,
  ideas,
  ideasTotal,
  analytics,
  onOpenIdea,
  onOpenAll,
}: Props) {
  const hasIdeas = ideas.length > 0;
  /** Часть идей не поместилась в топ — меняет заголовок и подводку блока. */
  const hasMore = ideasTotal > ideas.length;
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
          {/* топ идей по баллу; полный архив — на отдельном экране */}
          <section className="band">
            <div className="sec-head">
              <div className="sec-index">{idx()} · Идеи</div>
              <h2>{hasMore ? 'Сильнейшие разборы' : 'Ваши разборы'}</h2>
              <p className="sec-note">
                {hasMore
                  ? `Здесь ${ideas.length} лучших по баллу — кабинет не растёт бесконечно. Остальные (всего ${ideasTotal}) с поиском по словам — во «Всех идеях».`
                  : 'Сильнейшие сверху. Тап открывает полный отчёт: радар, критерии, риски и источники.'}
              </p>
            </div>
            <div className="idea-list">
              {ideas.map((idea) => (
                <IdeaRow key={idea.id} idea={idea} onOpen={onOpenIdea} />
              ))}
            </div>
            {/* Вход в архив показываем всегда: поиск нужен и когда идей ровно 10 */}
            <button type="button" className="btn more" onClick={onOpenAll}>
              Все идеи ({ideasTotal}) →
            </button>
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

      {/* пригласить друга — отдельный экран-приглашение (под флагом рефералов) */}
      {referralsEnabled() && (
        <section className="band">
          <div className="sec-head">
            <div className="sec-index">{idx()} · Друзья</div>
            <h2>Пригласить друга</h2>
            <p className="sec-note">
              Позовите знакомого по личной ссылке. Как только он разберёт первую
              идею — вам обоим упадёт по 10 проверок. Честный обмен, без условий.
            </p>
          </div>
          <div className="invite-link mono">{inviteLink(me.id)}</div>
          <button
            type="button"
            className="pay-cta"
            onClick={() => shareInvite(me.id, INVITE_SHARE_TEXT)}
          >
            📤 Поделиться ссылкой{' '}
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </button>
          <p className="pay-note">
            Бонусные проверки тратятся первыми, поверх недельного лимита, и не
            сгорают в конце недели.
          </p>
        </section>
      )}

      {/* команды сервиса — статичный справочник */}
      <section className="band">
        <div className="sec-head">
          <div className="sec-index">{idx()} · Команды</div>
          <h2>Команды сервиса</h2>
          <p className="sec-note">
            Тап по строке откроет чат с ботом сразу на нужной команде — или
            отправьте её обычным сообщением.
          </p>
        </div>
        {COMMAND_GROUPS.map((group) => (
          <div className="cmd-group" key={group.title}>
            <div className="cmd-group-title mono">{group.title}</div>
            {group.items.map((c) => {
              const name = c.cmd.slice(1);
              return DEEPLINK_CMDS.has(name) ? (
                <button
                  type="button"
                  className="cmd-row"
                  key={c.cmd}
                  onClick={() => openBotCommand(name)}
                >
                  <span className="cmd">{c.cmd}</span>
                  <span className="cmd-desc">{c.desc}</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              ) : (
                <div className="cmd-row" key={c.cmd}>
                  <span className="cmd">{c.cmd}</span>
                  <span className="cmd-desc">{c.desc}</span>
                </div>
              );
            })}
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
              <button
                type="button"
                className="plan-row"
                key={plan.tier || plan.title}
                onClick={() => openBotCommand('tariff')}
              >
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
                      <small>/{plan.period}</small>
                    </>
                  ) : (
                    'бесплатно'
                  )}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pay-cta"
            onClick={() => openBotCommand('tariff')}
          >
            Выбрать тариф в боте{' '}
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </button>
          <p className="pay-note">
            Оплата проходит в чате бота командой{' '}
            <span className="cmd-inline">/tariff</span>. Платёж принимает
            ЮKassa, чек придёт на почту. Разовый платёж за период доступа —
            автосписания нет.
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
