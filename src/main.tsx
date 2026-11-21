import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installNativeHooks } from './platform/native';
import { registerServiceWorker } from './platform/serviceWorker';
import { App } from './ui/App';
// Styles, one file per feature, each with its own media and container queries. They load in
// layers: the design system's tokens (built from design/system/tokens.json by
// design/vitePlugin.ts) and components, base, shared controls, features, lessons. A file may override rules of
// an earlier layer but never of another file in its own layer, so order within a layer is free.
import '../design/dist/tokens.css';
import '../design/system/components/bundle.css';
import './styles/base.css';
import './styles/controls.css';
import './styles/shell.css';
import './styles/topbar.css';
import './styles/sidebar.css';
import './styles/stage.css';
import './styles/practice-bar.css';
import './styles/results.css';
import './styles/progress.css';
import './styles/modal.css';
import './styles/setup.css';
import './styles/lessons/rhythm.css';
import './styles/lessons/scales.css';
import './styles/score.css';
import './styles/keyboard.css';

installNativeHooks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
