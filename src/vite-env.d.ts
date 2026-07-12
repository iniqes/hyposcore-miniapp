/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL API HypoScore, без завершающего слэша (например https://hyposcore.hyposcanco.ru). */
  readonly VITE_API_BASE: string;
  /** Username бота для deep-link'ов t.me (по умолчанию hyposcore_bot). Публичная константа, не секрет. */
  readonly VITE_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
