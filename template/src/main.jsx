import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initI18n } from './i18n'
import home from './data/home.json'
import about from './data/about.json'
import siteConfig from './data/siteConfig.json'
import blog from './data/blog.json'
import projects from './data/projects.json'
import originals from './data/originals.json'
import archive from './data/archive.json'

// Dev only: content saved from the editor doesn't hot-reload the app (see
// vite.config.js); public pages — e.g. the editor's preview — reload to show
// it, while the editor itself keeps its state.
if (import.meta.hot) {
  import.meta.hot.on('nnwoo:content-changed', () => {
    if (!/^\/editor(\/|$)/.test(window.location.pathname)) window.location.reload()
  })
}

// Mac editor app (vite build --mode app): the app posts the same signal
// after a save — see mac/SiteEditor/EditorWindowController.swift.
if (import.meta.env.MODE === 'app') {
  window.addEventListener('message', (e) => {
    if (e.data === 'siteproj:content-changed' && !/^\/editor(\/|$)/.test(window.location.pathname)) window.location.reload()
  })
}

// Translate the bundled content first, then load the app — App and the pages
// it lazy-loads read this data at module level, so it has to be localized
// before any of them are evaluated (hence the dynamic import).
initI18n([home, about, siteConfig, blog, projects, originals, archive])
  .then(() => import('./App.jsx'))
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
