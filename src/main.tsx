import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { tg } from './telegram';
import './theme.css';

// Telegram WebApp: сообщаем о готовности и разворачиваем на всю высоту.
tg?.ready();
tg?.expand();

// Тема: белый лист (светлая) или графитовая инверсия (тёмная).
// Цвет фона Telegram не тянем — палитра серии «Графит» самодостаточна.
// ?theme=dark — ручной просмотр тёмной темы вне Telegram.
if (
  tg?.colorScheme === 'dark' ||
  new URLSearchParams(window.location.search).get('theme') === 'dark'
) {
  document.documentElement.dataset.theme = 'dark';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
