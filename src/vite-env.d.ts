/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL API HypoScore, без завершающего слэша (например https://hyposcore.hyposcanco.ru). */
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
