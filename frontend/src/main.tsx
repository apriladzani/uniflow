import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { loadBranding } from './branding';
import './index.css';

// Custom logo and favicon are managed by platform admins and served by the API.
void loadBranding();

createRoot(document.getElementById('root')!).render(<App />);
