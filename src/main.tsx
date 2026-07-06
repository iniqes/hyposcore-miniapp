import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';

// Telegram WebApp SDK пока НЕ подключён — тема берётся заглушкой (светлая).
// В Фазе 5 сюда придёт window.Telegram.WebApp.themeParams + BackButton/MainButton.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
