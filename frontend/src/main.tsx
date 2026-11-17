import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { apiUrl } from './api/client';
import { applyFavicon } from './components/admin/AdminView';
import './index.css';

// Site favicon is managed by platform admins and served by the API (404 = none set).
applyFavicon(apiUrl('/branding/favicon'));

createRoot(document.getElementById('root')!).render(<App />);
