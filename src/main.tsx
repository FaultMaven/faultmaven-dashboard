import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'highlight.js/styles/github-dark-dimmed.css';
// Initialize storage adapter for web
import './lib/storage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
