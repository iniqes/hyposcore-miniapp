import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { tg } from './telegram';
import './theme.css';

// Telegram WebApp: сообщаем о готовности и разворачиваем на всю высоту.
tg?.ready();
tg?.expand();

// Минимальная тема: фон из Telegram, если клиент его отдал
// (сетка-паттерн из theme.css остаётся поверх).
if (tg?.themeParams.bg_color) {
  document.body.style.backgroundColor = tg.themeParams.bg_color;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
