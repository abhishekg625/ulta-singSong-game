import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics: page views only, no cookies. Production builds only, so local dev isn't counted. */}
    {import.meta.env.PROD && <Analytics />}
  </StrictMode>,
);
