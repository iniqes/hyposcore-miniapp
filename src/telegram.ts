// Тонкая типизированная обёртка над Telegram WebApp SDK (CDN-скрипт в index.html).
// Берём только то, что реально используем: initData, start_param, тема,
// ready/expand и BackButton (навигация «отчёт → кабинет»).

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
}

export interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TelegramWebApp {
  /** Сырая строка initData — уходит на бэк в заголовке Authorization. */
  initData: string;
  initDataUnsafe: {
    start_param?: string;
  };
  themeParams: TelegramThemeParams;
  /** 'dark' у клиентов с тёмной темой (может отсутствовать в старых версиях). */
  colorScheme?: 'light' | 'dark';
  BackButton?: TelegramBackButton;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  /** Открыть t.me-ссылку нативно, не закрывая мини-апп (может отсутствовать в старых клиентах). */
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/** Глобал SDK. undefined — если скрипт не загрузился (обычный браузер оффлайн и т.п.). */
export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp;

/** Строка initData; пустая — если апп открыт не из Telegram. */
export function initData(): string {
  return tg?.initData ?? '';
}

/** start_param из диплинка t.me/<bot>/<app>?startapp=… (если был). */
export function startParam(): string | undefined {
  return tg?.initDataUnsafe.start_param || undefined;
}

/** Сообщить Telegram, что апп готов, и развернуть на всю высоту. */
export function ready(): void {
  tg?.ready();
  tg?.expand();
}

/** Username бота — публичная константа, не секрет (переопределяется через VITE_BOT_USERNAME). */
export const BOT_USERNAME: string = import.meta.env.VITE_BOT_USERNAME || 'hyposcore_bot';

/**
 * Рефералы включены? Build-time флаг (VITE_REFERRALS_ENABLED), синхронизируется с ботовым
 * REFERRALS_ENABLED. По умолчанию ВЫКЛ — блок «Пригласить друга» скрыт (shadow): пока бот не
 * начисляет бонус, не показываем пользователю обещание, которое он не выполнит.
 */
export function referralsEnabled(): boolean {
  const v = String(import.meta.env.VITE_REFERRALS_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Личная реф-ссылка: t.me/<бот>?start=ref_<uid> (бот ловит ref_ в /start). */
export function inviteLink(uid: number): string {
  return `https://t.me/${BOT_USERNAME}?start=ref_${uid}`;
}

/**
 * Открыть нативный диалог Telegram «Поделиться» с реф-ссылкой и текстом.
 * Внутри Telegram — через openTelegramLink (не закрывая апп); в браузере — новой вкладкой.
 */
export function shareInvite(uid: number, text: string): void {
  const link = inviteLink(uid);
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/**
 * Открыть чат с ботом на команде: deep-link t.me/<bot>?start=cmd_<имя>
 * (бот разбирает cmd_* в обработчике /start). Внутри Telegram — нативно
 * через openTelegramLink; в обычном браузере/превью — новой вкладкой.
 */
export function openBotCommand(cmd: string): void {
  const url = `https://t.me/${BOT_USERNAME}?start=cmd_${cmd}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/** Нативный BackButton доступен с Bot API 6.1. */
export function backButtonSupported(): boolean {
  try {
    return Boolean(tg?.BackButton) && tg!.isVersionAtLeast('6.1');
  } catch {
    return false;
  }
}

/**
 * Показать нативный BackButton с обработчиком.
 * Возвращает функцию очистки (снять обработчик и спрятать кнопку)
 * или null, если BackButton не поддерживается — тогда UI рисует фолбэк.
 */
export function showBackButton(cb: () => void): (() => void) | null {
  if (!backButtonSupported()) return null;
  const bb = tg!.BackButton!;
  bb.onClick(cb);
  bb.show();
  return () => {
    bb.offClick(cb);
    bb.hide();
  };
}
