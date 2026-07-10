// Тонкая типизированная обёртка над Telegram WebApp SDK (CDN-скрипт в index.html).
// Берём только то, что реально используем: initData, start_param, тема, ready/expand.

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
}

export interface TelegramWebApp {
  /** Сырая строка initData — уходит на бэк в заголовке Authorization. */
  initData: string;
  initDataUnsafe: {
    start_param?: string;
  };
  themeParams: TelegramThemeParams;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
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
