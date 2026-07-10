// Типы формы результата EvalResult + образец mock-данных.
// Соответствует методологии Агента 01: 14 критериев в 5 группах.

/** Группы критериев (цвета в theme.css: --gA … --gE). */
export type CriterionGroup = 'A' | 'B' | 'C' | 'D' | 'E';

/** Идентификаторы 14 критериев. */
export type CriterionId =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C1' | 'C2' | 'C3'
  | 'D1'
  | 'E1' | 'E2';

export type ConfidenceLevel = 'высокая' | 'средняя' | 'низкая';

export interface Criterion {
  /** Короткое название критерия. */
  title: string;
  /** Балл 0–10. */
  score: number;
  /** Обоснование оценки (раскрывается по тапу). */
  rationale: string;
  /** Уверенность в оценке. */
  confidence: ConfidenceLevel;
  /** Источник/основание (URL или текст), если есть. */
  source?: string;
  /** Группа критерия. */
  group: CriterionGroup;
  /**
   * Инвертированный критерий: для него «выше = лучше» неочевидно
   * (например, риски). Помечается в UI как «↑ выше = лучше».
   */
  inverted: boolean;
}

export interface Verdict {
  /** Ярлык вердикта: «Требует пивота» и т.п. */
  label: string;
  /** Рекомендованное действие. */
  action: string;
}

export interface GroupMeta {
  id: CriterionGroup;
  title: string;
  /** Вес группы в итоговом балле, доля 0–1. */
  weight: number;
}

export interface EvalResult {
  /** Формулировка идеи/гипотезы. */
  idea: string;
  /** Итоговый балл 0–10. */
  score_final: number;
  verdict: Verdict;
  /** Режим оценки: экспресс / глубокий (как отдаёт бэк). */
  mode: 'express' | 'deep';
  /** Общая уверенность разбора. */
  confidence: ConfidenceLevel;
  /** Критерии по идентификаторам (все 14). */
  criteria: Record<CriterionId, Criterion>;
  /** Красная команда — главные риски. */
  red_team: string[];
  /** Источники, на которых основана оценка. */
  evidence_sources: EvidenceSource[];
}

export interface EvidenceSource {
  title: string;
  url?: string;
}

/** Метаданные 5 групп (для метрик и легенды радара). */
export const GROUPS: GroupMeta[] = [
  { id: 'A', title: 'Рынок и спрос', weight: 0.35 },
  { id: 'B', title: 'Конкуренция и защищённость', weight: 0.25 },
  { id: 'C', title: 'Реализуемость', weight: 0.2 },
  { id: 'D', title: 'Риски', weight: 0.08 },
  { id: 'E', title: 'AI-специфика', weight: 0.12 },
];

/** CSS-переменные цветов групп (совпадают с theme.css). */
export const GROUP_COLOR: Record<CriterionGroup, string> = {
  A: 'var(--gA)',
  B: 'var(--gB)',
  C: 'var(--gC)',
  D: 'var(--gD)',
  E: 'var(--gE)',
};

/** Порядок вывода критериев. */
export const CRITERION_ORDER: CriterionId[] = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3',
  'D1',
  'E1', 'E2',
];

export const mockResult: EvalResult = {
  idea: 'AI-репетитор по школьной математике',
  score_final: 5.5,
  verdict: {
    label: 'Требует пивота',
    action:
      'Рынок и тайминг за идею — но без слоя проверки решений и внятной монетизации это «ещё один репетитор». Меняйте не рынок, а механику доверия.',
  },
  mode: 'deep',
  confidence: 'средняя',
  criteria: {
    A1: {
      title: 'Острота проблемы',
      score: 8,
      rationale:
        'Родители платят за подготовку, ученики застревают на однотипных ошибках — боль частая и ощутимая, спрос устойчивый.',
      confidence: 'высокая',
      source: 'rbc.ru — рынок EdTech РФ 2025',
      group: 'A',
      inverted: false,
    },
    A2: {
      title: 'Размер рынка',
      score: 7,
      rationale:
        'EdTech-репетиторство в РФ — крупный и растущий сегмент; ниша школьной математики достаточно велика для устойчивой выручки.',
      confidence: 'средняя',
      source: 'rbc.ru — объём рынка EdTech РФ 2025',
      group: 'A',
      inverted: false,
    },
    A3: {
      title: 'Готовность платить',
      score: 6,
      rationale:
        'Платит родитель за результат, а не ученик за инструмент. Готовность есть, но привязана к измеримому прогрессу, а не к «ещё одному ИИ».',
      confidence: 'средняя',
      group: 'A',
      inverted: false,
    },
    A4: {
      title: 'Тайминг',
      score: 8,
      rationale:
        'Массовое привыкание к ИИ-ассистентам и доступные модели делают момент выхода благоприятным.',
      confidence: 'высокая',
      group: 'A',
      inverted: false,
    },
    B1: {
      title: 'Насыщенность рынка',
      score: 4,
      rationale:
        'Десятки решений «математика по фото» и бесплатный ChatGPT рядом — вход перегрет.',
      confidence: 'высокая',
      source: 'appstore — рейтинги решений «математика по фото»',
      group: 'B',
      inverted: true,
    },
    B2: {
      title: 'Защищённость (moat)',
      score: 4,
      rationale:
        'Проверка решений легко повторяется конкурентами; удержание держится на бренде и контенте, а не на технологии.',
      confidence: 'средняя',
      group: 'B',
      inverted: false,
    },
    B3: {
      title: 'Дифференциация',
      score: 5,
      rationale:
        'Пошаговые подсказки — хорошая, но не уникальная фича. Нужен явный отличительный слой (методика, проверка, гарантия результата).',
      confidence: 'средняя',
      group: 'B',
      inverted: false,
    },
    B4: {
      title: 'Сила конкурентов',
      score: 4,
      rationale:
        'Крупные EdTech-игроки и универсальные ассистенты имеют дистрибуцию и бюджеты, недоступные новому входу.',
      confidence: 'средняя',
      group: 'B',
      inverted: true,
    },
    C1: {
      title: 'Техническая сложность',
      score: 5,
      rationale:
        'Надёжная пошаговая проверка математики сложнее, чем кажется: LLM ошибается в выкладках, нужен верификатор.',
      confidence: 'средняя',
      group: 'C',
      inverted: true,
    },
    C2: {
      title: 'Стоимость запуска (MVP)',
      score: 5,
      rationale:
        'MVP на готовых моделях достижим, но качество требует данных, разметки и слоя проверки — это удорожает старт.',
      confidence: 'средняя',
      group: 'C',
      inverted: true,
    },
    C3: {
      title: 'Каналы дистрибуции',
      score: 3,
      rationale:
        'Доступ к школьникам дорогой и зарегулированный; органический рост в перегретой нише медленный.',
      confidence: 'низкая',
      group: 'C',
      inverted: false,
    },
    D1: {
      title: 'Регуляторные и этические риски',
      score: 6,
      rationale:
        'Работа с несовершеннолетними и обработка данных требуют осторожности, но риски управляемы при правильной политике.',
      confidence: 'средняя',
      group: 'D',
      inverted: true,
    },
    E1: {
      title: 'Зависимость от LLM',
      score: 5,
      rationale:
        'LLM может выдавать тонко неверные шаги — в обучении это подрывает доверие. Нужен обязательный слой проверки.',
      confidence: 'средняя',
      source: 'внутренний анализ надёжности моделей',
      group: 'E',
      inverted: true,
    },
    E2: {
      title: 'AI-дифференциация',
      score: 5,
      rationale:
        'Само по себе применение LLM не является преимуществом — оно доступно всем. Ценность создаёт методика поверх модели.',
      confidence: 'средняя',
      group: 'E',
      inverted: false,
    },
  },
  red_team: [
    'Ошибки модели в шагах решения подрывают доверие — в образовании это фатально.',
    'Монетизация неясна: школьники не платят, а родители платят за результат, а не за «ещё один ИИ».',
    'Вход перегрет: десятки решений и бесплатный ChatGPT рядом.',
  ],
  evidence_sources: [
    {
      title: 'rbc.ru — объём рынка EdTech РФ 2025',
      url: 'https://rbc.ru',
    },
    {
      title: 'appstore — рейтинги решений «математика по фото»',
      url: 'https://apps.apple.com',
    },
  ],
};
