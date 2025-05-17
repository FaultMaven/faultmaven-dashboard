// src/entrypoints/sidepanel_manual/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import SidePanelApp from '../../shared/ui/SidePanelApp'; // Path to your main React app
import '../../assets/styles/globals.css';      // Path to your global Tailwind styles

function mountReactApp() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <SidePanelApp /> {/* This is your full SidePanelApp */}
      </React.StrictMode>
    );
    console.log('[sidepanel_manual/main.tsx] React app mounted successfully.');
  } else {
    console.error('[sidepanel_manual/main.tsx] Fatal Error: Root element #root not found in sidepanel_manual/index.html.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountReactApp);
} else {
  mountReactApp();
}
