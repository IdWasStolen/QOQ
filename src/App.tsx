import '@lark-base-open/js-sdk/dist/style/dashboard.css';
import './App.scss';
import './locales/i18n';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import PeriodAnalysis from './components/PeriodAnalysis';

export default function App() {
  return <PeriodAnalysis />;
}