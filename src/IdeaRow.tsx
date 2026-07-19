// Строка идеи в списке — общая для кабинета (топ-10) и архива («Все идеи»).
// Вынесена из CabinetScreen, чтобы две поверхности не разъехались: балл, цвет
// вердикта и клавиатурная доступность у них обязаны совпадать.

import type { CSSProperties } from 'react';
import type { IdeaListItem } from './api';

/** Цвет вердикта по баллу (та же семантика, что в отчёте). */
export function verdictVar(score: number): string {
  if (score >= 8) return 'var(--v-strong)';
  if (score >= 6) return 'var(--v-good)';
  if (score >= 4) return 'var(--v-pivot)';
  return 'var(--v-no)';
}

/** Русский формат числа: 5.5 → «5,5». */
export function ru(n: number): string {
  return String(n).replace('.', ',');
}

/** «1 версия», «3 версии», «7 версий». */
export function versionsRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return `${n} версия`;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return `${n} версии`;
  return `${n} версий`;
}

/** «2026-07-09 18:12:00» → «9 июля» (с годом, если не текущий). */
export function dateRu(s: string): string {
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
  idea: IdeaListItem;
  onOpen: (id: number) => void;
}

export default function IdeaRow({ idea, onOpen }: Props) {
  return (
    <div
      className="idea-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(idea.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(idea.id);
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
  );
}
