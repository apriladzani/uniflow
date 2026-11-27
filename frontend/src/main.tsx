import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { loadBranding } from './branding';
import { applyTheme } from './theme';
import './index.css';

// Custom logo and favicon are managed by platform admins and served by the API.
// Apply the saved/device theme before the first render so the page never flashes light.
applyTheme();
void loadBranding();

createRoot(document.getElementById('root')!).render(<App />);
