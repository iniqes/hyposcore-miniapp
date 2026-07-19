// Экран «Все идеи»: полный архив разборов с поиском и сортировкой.
// Кабинет показывает только топ-10 — всё остальное живёт здесь.
// Компонент презентационный: состояние держит useIdeasArchive в App.

import IdeaRow from './IdeaRow';
import type { IdeasArchive } from './useIdeasArchive';

/** «5 идей», «1 идея», «22 идеи». */
function ideasRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return `${n} идея`;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} идеи`;
  return `${n} идей`;
}

/** «найдено 3», «показано 20 из 47» — подпись под поиском. */
function counterText(a: IdeasArchive): string {
  if (a.total === 0) return '';
  if (a.items.length >= a.total) {
    return a.query ? `найдено ${ideasRu(a.total)}` : `всего ${ideasRu(a.total)}`;
  }
  return `показано ${a.items.length} из ${a.total}`;
}

interface Props {
  archive: IdeasArchive;
  onOpenIdea: (id: number) => void;
  /** Возврат в кабинет — дублирует нативный BackButton (его может не быть). */
  onBack: () => void;
}

export default function IdeasScreen({ archive, onOpenIdea, onBack }: Props) {
  const { query, sort, items, phase, loadingMore, hasMore } = archive;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <span className="glyph" />
          HypoScore
        </span>
      </div>

      <button type="button" className="backlink" onClick={onBack}>
        ← Кабинет
      </button>

      <section className="band">
        <div className="sec-head">
          <h2>Все идеи</h2>
          <p className="sec-note">
            Весь архив разборов. Поиск идёт и по названию, и по тексту самой
            идеи — можно искать по памяти, а не по заголовку.
          </p>
        </div>

        <div className="search">
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => archive.setQuery(e.target.value)}
            placeholder="Поиск по идеям"
            aria-label="Поиск по идеям"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => archive.setQuery('')}
              aria-label="Очистить поиск"
            >
              ×
            </button>
          )}
        </div>

        <div className="sortbar" role="group" aria-label="Порядок списка">
          <button
            type="button"
            className={`chip${sort === 'fresh' ? ' on' : ''}`}
            aria-pressed={sort === 'fresh'}
            onClick={() => archive.setSort('fresh')}
          >
            Свежие
          </button>
          <button
            type="button"
            className={`chip${sort === 'score' ? ' on' : ''}`}
            aria-pressed={sort === 'score'}
            onClick={() => archive.setSort('score')}
          >
            По баллу
          </button>
          {/* Счётчик — в той же строке: держит «сколько всего» на виду при листании. */}
          <span className="sortbar-count">{counterText(archive)}</span>
        </div>

        {phase === 'error' && (
          <div className="idea-empty">
            <p>Не удалось загрузить список.</p>
            <button type="button" className="btn" onClick={archive.reload}>
              Повторить
            </button>
          </div>
        )}

        {phase === 'loading' && <div className="idea-empty">Загружаем…</div>}

        {phase === 'ready' && items.length === 0 && (
          <div className="idea-empty">
            {query
              ? `По запросу «${query}» ничего не нашлось. Попробуйте другое слово.`
              : 'Пока ни одной идеи. Пришлите идею боту — разбор появится здесь.'}
          </div>
        )}

        {phase === 'ready' && items.length > 0 && (
          <>
            <div className="idea-list">
              {items.map((idea) => (
                <IdeaRow key={idea.id} idea={idea} onOpen={onOpenIdea} />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                className="btn more"
                onClick={archive.loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Загружаем…' : 'Показать ещё'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
