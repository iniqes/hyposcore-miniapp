import ReportScreen from './ReportScreen';
import { mockResult } from './mockData';

/**
 * Корневой компонент Mini App.
 * Пока показывает единственный экран — «Отчёт» из mock-данных (Фаза 5).
 * Реальные данные придут из бота через initData / API.
 */
export default function App() {
  return <ReportScreen result={mockResult} />;
}
