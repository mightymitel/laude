import { createRoot } from 'react-dom/client';
import '@laude/design-system/styles.css';
import './console.css';
import App from './App';
import { initSongs } from './engine';

void initSongs();

const container = document.getElementById('root');
if (!container) throw new Error('LauDJ: #root container missing in index.html');
createRoot(container).render(<App />);
