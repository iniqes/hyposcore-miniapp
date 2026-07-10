# PLAN: живые данные в Mini App «Отчёт» (HypoScore)

Подготовительная спецификация доводки фронта до прода. Составлена 10.07.2026 по реальному коду
двух репо: фронт `/Users/niklebed/hyposcore-miniapp`, бэкенд
`/Users/niklebed/product-scoring-bots-and-master-plus-apps/bots/agent01`.

Прод-точки:
- Фронт: GitHub Pages `https://iniqes.github.io/hyposcore-miniapp/` (base `/hyposcore-miniapp/` в `vite.config.ts:6`).
- API: `https://hyposcore.hyposcanco.ru` → Caddy → порт 8081, systemd-юнит `agent01-webapi`
  (упоминается в `infra/cutover/03-switch-units.sh:15` платформенного репо).

---

## 1. Аутентификация: УЖЕ РЕАЛИЗОВАНА на бэке, фронту осталось её использовать

Главная находка: валидация Telegram initData на сервере **полностью готова** — писать её не надо.

Как устроено (все пути относительно `bots/agent01/src/agent01/`):

- **Извлечение** — `webapi/server.py:77-84` `_extract_init_data()`: initData берётся из заголовка
  `Authorization: tma <initData>` ИЛИ из query `?initData=<...>`. Оба варианта рабочие.
- **Авторизация запроса** — `webapi/server.py:87-101` `_authorize()`: без валидного initData любая
  ручка `/api/*` отвечает `401 {"error":"unauthorized"}`. Без авторизации только `/health`
  (`server.py:107`) и `/yookassa/webhook` (server-to-server, `server.py:197`).
- **HMAC-валидатор** — `webapi/auth.py:26-101` `validate_init_data()`: официальный алгоритм
  Telegram Mini Apps, только stdlib:
  1. `parse_qsl` initData, вынуть `hash`;
  2. `data_check_string` = пары `k=v` (кроме hash), отсортированные по ключу, через `\n`;
  3. `secret_key = HMAC_SHA256(key=b"WebAppData", msg=bot_token)`;
  4. `computed = HMAC_SHA256(key=secret_key, msg=data_check_string).hexdigest()`;
  5. `hmac.compare_digest` (constant-time);
  6. свежесть `auth_date`: **max_age_s = 86400 (24 часа)**, с допуском на рассинхрон часов в обе
     стороны (`auth.py:74-83`).
- **Токен на сервере** — `webapi/server.py:38-46` `_load_bot_token()`: `TELEGRAM_BOT_TOKEN` из
  `.env` корня agent01 (тот же токен, что у бота, `adapters/telegram/bot.py:59`). Если токен пуст —
  все запросы 401 (предупреждение в `server.py:271-272`).
- **uid** — `auth.py:104-117` `user_id_from()`: telegram id из распакованного JSON-поля `user`.
  Владение идеей проверяется на каждом `GET /api/idea/{id}`: 403 если владелец != uid, 404 если
  нет (`server.py:161-165`).

Что нужно фронту: отправлять `Authorization: tma ${window.Telegram.WebApp.initData}` на каждый
запрос. Query-вариант `?initData=` не использовать (initData попадает в логи Caddy/access-логи).

Срок годности: initData живёт 24 часа с момента открытия mini app; при 401 корректная реакция —
экран «Переоткройте приложение» (initData обновляется только при новом открытии WebView).

CORS: `webapi/server.py:33-35` `_webapp_origin()` — origin из env `WEBAPP_ORIGIN`, дефолт `*`.
CORS-заголовки вешаются на все ответы включая ошибки (middleware `server.py:238-247`), preflight
OPTIONS → 204 (`server.py:231-235, 263`). Разрешённые заголовки уже включают `Authorization`
(`server.py:65`). **`WEBAPP_ORIGIN` отсутствует в `.env.example`** — см. шаг (д).

---

## 2. Контракт данных: `GET /api/idea/{id}` ↔ типы фронта

### Что реально отдаёт бэк

Handler `webapi/server.py:147-182` `handle_idea()` собирает ответ:

```json
{
  "id": 42,                       // server.py:173
  "title": "…",                   // repo.title_of(), storage/repo.py:283
  "text": "полный текст идеи",    // repo.latest(), storage/repo.py:265
  "version_count": 3,             // storage/repo.py:289
  "result": { …dataclasses.asdict(EvalResult)… }   // server.py:177
}
```

`result` — рекурсивный `asdict` датакласса `EvalResult` (`core/schema.py:44-68`):

| Поле result | Тип | Примечание |
|---|---|---|
| `criteria` | `dict[str, CriterionScore]` | ключи A1…E2; каждый: `{id, score(1-10 int), rationale, confidence, source(str\|null)}` (`schema.py:8-15`) |
| `score_raw` | float 1–10 | до киллеров |
| `score_final` | float 1–10 | после потолков-киллеров |
| `applied_killers` | `list[str]` | id сработавших киллеров (rubric_v1.yaml:122-138) |
| `verdict` | `{label, action, band:[min,max]}` | `schema.py:27-31`; band — кортеж → в JSON список |
| `title` | str | краткое название идеи от LLM |
| `confidence` | str | «низкая/средняя/высокая» |
| `red_team` | `list[str]` | риски |
| `assumptions` | `list[str]` | допущения |
| `clarifying_question` | `str\|null` | |
| `model`, `grounded`, `usage`, `latency_s`, `timings`, `router_attempts` | | телеметрия |
| `evidence_sources` | `list[str]` | **голые URL**, только deep |
| `evidence_refs` | `list[{url,title,snippet}]` | аннотированные источники, только deep |
| `mode` | `"express" \| "deep"` | |
| `named_entities`, `entity_checks`, `competitors`, `factcheck` | | deep-фактура |

### Попольное сопоставление с фронтом (`src/mockData.ts`)

| Фронт (`EvalResult`, mockData.ts:51-67) | Бэк | Статус |
|---|---|---|
| `idea: string` (заголовок h1, ReportScreen.tsx:83) | `title` (верхний уровень) или `result.title`; `text` — полный текст, для h1 длинный | ПЕРЕИМЕНОВАТЬ: маппить `title → idea` (или показать `text` в раскрывашке) |
| `score_final: number` 0–10 | `result.score_final` float 1–10 | ✅ совпадает |
| `verdict.{label,action}` | `result.verdict.{label,action}` (+`band` — игнорировать) | ✅ совпадает |
| `mode: 'quick' \| 'deep'` | `result.mode: 'express' \| 'deep'` | ❌ РАСХОЖДЕНИЕ: у бэка `express`. Рендер не падает (ReportScreen.tsx:76 сравнивает с 'deep'), но TS-тип врёт → поменять тип на `'express' \| 'deep'` |
| `confidence: ConfidenceLevel` | `result.confidence` те же три строки | ✅ |
| `criteria[id].score` | `result.criteria[id].score` | ✅ |
| `criteria[id].rationale` | `result.criteria[id].rationale` | ✅ |
| `criteria[id].confidence` | `result.criteria[id].confidence` | ✅ |
| `criteria[id].source?` | `result.criteria[id].source` (null → undefined) | ✅ |
| `criteria[id].title` | ❌ бэк НЕ отдаёт | Взять из локального словаря по id (см. ниже) |
| `criteria[id].group` | ❌ не отдаёт | Уже выводится из id: `groupOf()` = `id[0]` (ReportScreen.tsx:43-45) — словарь в типе избыточен |
| `criteria[id].inverted` | ❌ не отдаёт | Локальный словарь |
| `red_team: string[]` | `result.red_team` | ✅ |
| `evidence_sources: EvidenceSource[]` `{title,url?,accessed?}` | ❌ у бэка `evidence_sources: string[]` (URL) и `evidence_refs: [{url,title,snippet}]` | АДАПТЕР: приоритет `evidence_refs` → `{title, url}`; фолбэк `evidence_sources` → `{title: url, url}`. Поля `accessed` у бэка нет — убрать из UI или не показывать |

### Чего фронту не хватает / что надо добавить

1. **Словарь метаданных критериев** (title, inverted) — источник истины
   `config/methodology/rubric_v1.yaml:33-118`. Внимание: заголовки в mockData.ts РАСХОДЯТСЯ с
   реальной рубрикой (у фронта A3 «Готовность платить», в рубрике A3 = «Тайминг (why now)»;
   B1 у фронта «Насыщенность рынка» vs «Конкурентная плотность»; C2 «Стоимость запуска» vs
   «founder-market fit»; C3 «Каналы дистрибуции» vs «Монетизационный потенциал»; E2
   «AI-дифференциация» vs «Барьер на данных» и т.д.). Для inverted-критериев (B3, C1, D1, E1)
   рубрика даёт поле `display` («Лёгкость входа на рынок» и т.п.) — брать его.
   Также веса групп в `GROUPS` (mockData.ts:77-83) сверить: рубрика A35/B25/C20/D8/E12 — совпало,
   но заголовок B «Конкуренция и защищённость», C заголовки сверить при переносе.
2. **Защита от неполных criteria**: ReportScreen.tsx:56,63,197 индексирует
   `result.criteria[id]` напрямую по всем 14 id — если бэк вернёт неполный набор, будет крэш.
   Нужен дефолт `{score: 0, rationale: '—', confidence: 'низкая'}`.
3. **Бэк отдаёт, фронт не показывает** (кандидаты на v2, не блокируют): `score_raw`,
   `applied_killers` (почему срезан балл — ценно!), `assumptions`, `clarifying_question`,
   `competitors`, `factcheck`, `version_count`, `model`.

### Остальные ручки (для экрана «Кабинет»)

- `GET /api/ideas` (`server.py:134-144` → `storage/repo.py:242-253`):
  `{"ideas": [{id, title, score, verdict(строка-label), versions, updated(str)}]}` — до 50, свежие первыми.
- `GET /api/me` (`server.py:112-131`): `{"user": {id, first_name, username}}`.
- `GET /api/analytics` (`server.py:185-194` → `webapi/analytics.py:11-32`):
  `{ideas_count, versions_total, score_avg, score_max, score_min, verdicts: {label: count}, last_updated}` — по последним 100 идеям.

---

## 3. Как фронт узнаёт, какой отчёт показать

**Сейчас — никак.** Бот шлёт статичный URL: `/app`-handler
(`adapters/telegram/bot.py:863-875`) делает `WebAppInfo(url=MINIAPP_URL)` без каких-либо
параметров; `MINIAPP_URL` — из `.env` (`bot.py:62`, `.env.example:6`). id идеи не передаётся ни
query, ни start_param. Постоянной menu button нет (единственное `WebAppInfo` в bot.py — строка 870).

Предлагаемая механика (три слоя, по убыванию приоритета):

1. **Query-параметр в URL кнопки** — для inline-кнопок `web_app` Telegram НЕ передаёт
   `start_param` (он приходит только из прямой ссылки `t.me/<bot>/<app>?startapp=`), зато
   query-string URL сохраняется в WebView. Бот подставляет id:
   `WebAppInfo(url=f"{MINIAPP_URL}?idea={idea_id}")`.
   Куда встроить: кнопку «📱 Отчёт в приложении» добавить в `_verdict_kb()`
   (`bot.py:99-124` — клавиатура, которая уходит под каждым разбором: вызовы `bot.py:165, 1230,
   1275`), прокинув `idea_id` параметром; в `/app`-handler взять текущую идею из
   `repo.get_state(uid)["idea_id"]` (`storage/repo.py:297`).
   Фронт читает: `new URLSearchParams(window.location.search).get('idea')`
   (Telegram добавляет свои данные во fragment `#tgWebAppData…` — query не трогает).
2. **`start_param` как фолбэк** — если позже заведём named Mini App у BotFather и диплинки
   `t.me/<bot>/<app>?startapp=<id>`: читать `Telegram.WebApp.initDataUnsafe.start_param`
   (сервер его тоже видит внутри подписанного initData как `start_param`).
3. **Без параметра — последняя идея**: `GET /api/ideas`, взять `ideas[0]` (список уже
   отсортирован `ORDER BY updated DESC`, repo.py:246) и загрузить `GET /api/idea/{ideas[0].id}`.
   Пустой список → экран «Пришлите идею боту».

Это и дефолт для menu button (у неё параметр на идею не передать — только статичный URL).

---

## 4. План работ

Оценки: S ≤ 0.5 дня, M ≈ 1 день, L ≈ 2+ дня. Параллельность отмечена.

### (а) Подключение Telegram WebApp SDK — **S**

Рекомендация: **CDN-скрипт + `window.Telegram.WebApp`**, без npm-обёртки. По гайдлайнам Telegram
скрипт `https://telegram.org/js/telegram-web-app.js` обязан подключаться в `<head>` — значит
глобал будет в любом случае, и `@twa-dev/sdk` лишь добавляет зависимость и дублирование. Пишем
тонкий типизированный модуль-обёртку.

- `index.html:13` — перед `</head>` добавить `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.
- Новый `src/telegram.ts`: типы `window.Telegram.WebApp`, экспорт `tg`, хелперы
  `initData()`, `startParam()`, `ready()`.
- `src/main.tsx`: на старте `tg.ready(); tg.expand();`.
- Тема: маппинг `themeParams` → CSS-переменные `src/theme.css` (фон/текст/hint), подписка на
  `themeChanged`. Минимум: `document.body.style.background = tg.themeParams.bg_color`.
- BackButton: на экране «Отчёт», если открыт из «Кабинета», `tg.BackButton.show()/onClick` (API ≥ 6.1 — проверять `tg.isVersionAtLeast('6.1')`).
- Safe-area: `viewport-fit=cover` уже стоит (`index.html:5`); добавить отступы
  `env(safe-area-inset-*)` и, для новых клиентов, `tg.contentSafeAreaInset` (API 8.0, с проверкой).

### (б) Слой API — **M** (параллельно с (а))

- Новый `src/api.ts`: `const BASE = import.meta.env.VITE_API_BASE`;
  `fetch(BASE + path, {headers: {Authorization: 'tma ' + tg.initData}})`.
- Файлы env фронта: `.env.production` → `VITE_API_BASE=https://hyposcore.hyposcanco.ru`;
  `.env.development` → локальный/прод по вкусу. Прописать тип в `src/vite-env.d.ts`.
- Обработка: 401 → экран «Сессия устарела — переоткройте приложение» (и отдельный случай
  `!tg.initData` — «Откройте через Telegram»); 403/404 → «Идея не найдена»; сетевые/5xx → retry-кнопка.
- Маппер `toEvalResult(json)` — адаптер контракта из §2 (title→idea, evidence_refs→sources,
  дефолты недостающих критериев, словарь названий критериев из рубрики).
- `credentials` в fetch НЕ включать (см. риски).

### (в) Skeleton-состояние — **S** (параллельно, после (б) по типам)

- `src/App.tsx:9-11` — заменить рендер mockResult на конечный автомат
  `loading | error(kind) | ready(result)`.
- Skeleton-версия экрана отчёта (серые плашки на месте балла/радара/критериев) — CSS-only.
- mockData.ts не удалять: оставить для dev-режима (`?mock=1` или `import.meta.env.DEV`).

### (г) Menu button в боте — **S** (параллельно; репо бэка)

- `adapters/telegram/bot.py:1502` `main()` — после `bot.set_my_commands([...])`
  (строки 1509-1522) добавить:
  `await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Кабинет", web_app=WebAppInfo(url=MINIAPP_URL)))`
  (импорт `MenuButtonWebApp` в блок импортов `aiogram.types`, рядом с `WebAppInfo`, bot.py:31);
  обернуть в `if MINIAPP_URL:`.
- Там же по §3: кнопка с `?idea={id}` в `_verdict_kb()` (bot.py:99) и в `/app` (bot.py:863).

### (д) WEBAPP_ORIGIN — **S** (репо бэка + сервер; можно сразу)

Точный origin: `https://iniqes.github.io` — **без пути** `/hyposcore-miniapp/` (origin = схема+хост,
браузер шлёт именно его; значение с путём сломает CORS).

Конкретные строки в `bots/agent01/.env.example` (после строки 6 `MINIAPP_URL=`):

```
WEBAPP_ORIGIN=           # точный origin фронта Mini App для CORS, напр. https://iniqes.github.io (БЕЗ пути; пусто = '*', только dev)
```

На сервере: дописать `WEBAPP_ORIGIN=https://iniqes.github.io` в боевой `.env` и
`systemctl restart agent01-webapi`. Заодно `MINIAPP_URL=https://iniqes.github.io/hyposcore-miniapp/`.

### (е) Экран «Кабинет» — **M/L** (после (а)+(б); не блокирует первый спринт)

По реальным ответам ручек (§2):

- Шапка: `GET /api/me` → имя/username.
- Список идей: `GET /api/ideas` → карточки `{title, score, verdict, versions, updated}`,
  тап → экран «Отчёт» (`/api/idea/{id}`) + `tg.BackButton`.
- Сводка: `GET /api/analytics` → плитки ideas_count/score_avg/score_max + распределение вердиктов
  (`verdicts: {label: count}`).
- Роутинг: без react-router — свой стейт `screen: 'report' | 'cabinet'` (2 экрана).

### (ж) Code-split recharts — **S** (параллельно, независимо)

`vite.config.ts:5-12` — добавить:

```ts
build: {
  rollupOptions: {
    output: { manualChunks: { recharts: ['recharts'] } },
  },
},
```

Плюс `React.lazy` на радар-блок (recharts используется только в ReportScreen.tsx) — тогда skeleton
виден мгновенно, тяжёлый чанк доезжает вторым запросом.

**Параллельные дорожки:** (а)+(в)+(ж) — фронт-косметика; (б) — фронт-данные; (г)+(д) — бэкенд/сервер.
Пересечение только в типах между (б) и (в).

---

## 5. Риски и грабли

1. **HTTPS на Pages** — есть, initData валидируется на нашем API, тут ок. Но mini app по URL Pages
   открывается и в обычном браузере — там `tg.initData === ''` → любой запрос даст 401. Нужен
   явный экран «Откройте через Telegram», а не бесконечный skeleton.
2. **CORS + credentials**: сервер отвечает `Access-Control-Allow-Origin` без
   `Access-Control-Allow-Credentials` (`server.py:63-67`). Заголовок `Authorization` — это НЕ
   credentials в смысле fetch, он разрешён через `Allow-Headers` (уже есть). Поэтому во fetch
   держать `credentials: 'omit'` (дефолт) и не использовать куки — иначе с `WEBAPP_ORIGIN='*'`
   браузер срежет запрос.
3. **Кэш GitHub Pages**: assets хэшируются Vite (безопасно), но `index.html` кэшируется CDN Pages
   ~10 минут — после деплоя старый index может тянуть уже несуществующие чанки. Лечится
   терпением/жёсткой перезагрузкой; в WebView Telegram дополнительно живёт свой кэш — при отладке
   закрывать mini app полностью. Не делать долгоживущих ссылок на конкретные чанки.
4. **Размер initData в заголовке**: обычно 0.5–1.5 КБ (user + hash + auth_date), лимиты заголовков
   Caddy/aiohttp (8К+) не задевает. Но НЕ передавать initData в query (`?initData=` — вариант
   `server.py:84`): попадает в access-логи и историю. Только заголовок.
5. **Старые клиенты Telegram**: `BackButton` — API 6.1+, `contentSafeAreaInset` — 8.0,
   `themeParams` частично пуст на десктопах старых версий. Всегда через
   `tg.isVersionAtLeast(...)` и CSS-фолбэки. Кнопка `web_app` в inline-клавиатуре требует
   Telegram ≥ 6.0 (апрель 2022) — на старее кнопка просто не сработает, это приемлемо.
6. **auth_date 24 часа**: Telegram НЕ обновляет initData, пока WebView открыт. Пользователь,
   державший mini app открытым сутки, начнёт ловить 401 — реакция «переоткройте», не ретрай.
7. **Неполный набор критериев в ответе** (§2, п.2 расхождений) — обязательные дефолты на фронте.
8. **`mode: 'express'`** вместо ожидаемого `'quick'` — поправить тип, иначе TS маскирует реальность.
9. **CSP/внешние хосты**: index.html уже тянет Google Fonts (`index.html:7-12`) — добавление
   telegram-web-app.js ситуацию не меняет; Pages ограничений не накладывает.

---

## Порядок первого спринта (минимум до живого отчёта в проде)

1. **(д)** Сервер: `WEBAPP_ORIGIN=https://iniqes.github.io` +
   `MINIAPP_URL=https://iniqes.github.io/hyposcore-miniapp/` в боевой `.env`, рестарт
   `agent01-webapi` и бота; строка в `.env.example`. — полчаса, разблокирует всё остальное.
2. **(а-минимум)** CDN-скрипт в `index.html` + `src/telegram.ts` + `ready()/expand()`. Тему и
   BackButton — потом.
3. **(б)** `src/api.ts` + `VITE_API_BASE` + маппер контракта (title→idea, evidence_refs,
   словарь критериев из rubric_v1.yaml, mode) + обработка 401/пусто/сеть.
4. **(в)** App.tsx: loading → skeleton, error → экраны, ready → ReportScreen. Выбор идеи:
   `?idea=` из query, иначе `ideas[0]` из `/api/ideas`.
5. **(г-минимум)** В боте: `?idea={id}` в `/app` (bot.py:863-875). Кнопку в `_verdict_kb` и
   menu button — следом, вне критического пути.
6. Деплой (push → Actions → Pages), проверка с телефона: `/app` → живой отчёт своей идеи.

Вне спринта: кабинет (е), code-split (ж), тема/BackButton/safe-area целиком, показ
`applied_killers`/`assumptions`, синхронизация названий критериев с рубрикой в mock-данных.
