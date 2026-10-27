import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import siteConfig from './data/siteConfig.json'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import { SiteMaintenance, MAINTENANCE_SESSION_KEY as SESSION_KEY } from './components/SiteMaintenance'
import { BASENAME } from './i18n'
import { minimalAllows, MINIMAL_REDUCE_MOTION } from './utils/minimal'
import { navRedirects, structureFlag } from './utils/structure'
import { pages, RESERVED_PATHS } from './utils/pages'

function ExternalRedirect({ href }) {
  useEffect(() => { window.location.href = href }, [href])
  return null
}

const Home = lazy(() => import('./pages/Home'))
const About = lazy(() => import('./pages/About'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Originals = lazy(() => import('./pages/Originals'))
const OriginalDetail = lazy(() => import('./pages/OriginalDetail'))
const Blog = lazy(() => import('./pages/Blog'))
const BlogPost = lazy(() => import('./pages/BlogPost'))
const Contacts = lazy(() => import('./pages/Contacts'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Archive = lazy(() => import('./pages/Archive'))
const CustomPage = lazy(() => import('./pages/CustomPage'))
const EditorArchive = lazy(() => import('./pages/editor/EditorArchive'))
const EditorTranslations = lazy(() => import('./pages/editor/EditorTranslations'))
const EditorLayout = lazy(() => import('./pages/editor/EditorLayout'))
const EditorHome = lazy(() => import('./pages/editor/EditorHome'))
const EditorAbout = lazy(() => import('./pages/editor/EditorAbout'))
const EditorProject = lazy(() => import('./pages/editor/EditorProject'))
const EditorOriginal = lazy(() => import('./pages/editor/EditorOriginal'))
const EditorBlog = lazy(() => import('./pages/editor/EditorBlog'))
const EditorContacts = lazy(() => import('./pages/editor/EditorContacts'))
const EditorMaintenance = lazy(() => import('./pages/editor/EditorMaintenance'))
const EditorNotFound = lazy(() => import('./pages/editor/EditorNotFound'))
const EditorAllProjects = lazy(() => import('./pages/editor/EditorAllProjects'))
const EditorAllOriginals = lazy(() => import('./pages/editor/EditorAllOriginals'))
const EditorCategory = lazy(() => import('./pages/editor/EditorCategory'))
const EditorBlogPost = lazy(() => import('./pages/editor/EditorBlogPost'))
const EditorBlogLanding = lazy(() => import('./pages/editor/EditorBlogLanding'))
const EditorNavbar = lazy(() => import('./pages/editor/EditorNavbar'))
const EditorFooter = lazy(() => import('./pages/editor/EditorFooter'))
const EditorDashboard = lazy(() => import('./pages/editor/EditorDashboard'))

function AnimatedRoutes() {
  const location = useLocation()
  // <main> remounts on every path change (key={location.pathname}) so its
  // page-fade animation restarts, and that animation starts at opacity:0 —
  // meaning every navigation shows body's plain white background for a
  // moment before the new page fades in. Barely noticeable going *to* a new
  // page, but jarring on browser back/forward ('POP'), where the user
  // expects to land straight back on a page they just saw, not watch it
  // flash white first — so the fade only plays for an actual forward
  // navigation (a real link click), not history traversal.
  const navigationType = useNavigationType()
  const isEditor = location.pathname.startsWith('/editor')

  if (isEditor) {
    return (
      <Suspense fallback={null}>
      <Routes location={location}>
        <Route path="/editor" element={<EditorLayout />}>
          <Route index element={<EditorDashboard />} />
          <Route path="home" element={<EditorHome />} />
          <Route path="about" element={<EditorAbout />} />
          <Route path="projects/:category/:id" element={<EditorProject />} />
          <Route path="originals/:category/:id" element={<EditorOriginal />} />
          <Route path="blog" element={<EditorBlog />} />
          <Route path="contacts" element={<EditorContacts />} />
          <Route path="maintenance" element={<EditorMaintenance />} />
          <Route path="not-found" element={<EditorNotFound />} />
          <Route path="archive" element={<EditorArchive />} />
          <Route path="translations" element={<EditorTranslations />} />
          <Route path="all-projects" element={<EditorAllProjects />} />
          <Route path="all-originals" element={<EditorAllOriginals />} />
          <Route path="projects-cat/:category" element={<EditorCategory />} />
          <Route path="originals-cat/:category" element={<EditorCategory />} />
          <Route path="blog-post/:id" element={<EditorBlogPost />} />
          <Route path="blog-landing" element={<EditorBlogLanding />} />
          <Route path="navbar" element={<EditorNavbar />} />
          <Route path="footer" element={<EditorFooter />} />
        </Route>
      </Routes>
      </Suspense>
    )
  }

  if (siteConfig.maintenance && !import.meta.env.DEV && sessionStorage.getItem(SESSION_KEY) !== 'true') return <SiteMaintenance />

  // Minimal mode: pages it leaves out (Originals, Blog, unpicked projects…)
  // send their old links home instead of showing them.
  if (!minimalAllows(location.pathname)) return <Navigate to="/" replace />

  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
      <main key={location.pathname} className={navigationType === 'POP' || MINIMAL_REDUCE_MOTION ? '' : 'page-fade'}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:category" element={<Projects />} />
          <Route path="/projects/:category/:id" element={<ProjectDetail />} />
          <Route path="/originals" element={<Originals />} />
          <Route path="/originals/:category" element={<Originals />} />
          <Route path="/originals/:category/:id" element={<OriginalDetail />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:category" element={<Blog />} />
          <Route path="/blog/post/:id" element={<BlogPost />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/archive" element={<Archive />} />
          {/* The Sitemap page was removed in favor of the Archive; keep old links working. */}
          <Route path="/sitemap" element={<Navigate to="/archive" replace />} />
          {pages.filter(p => !RESERVED_PATHS.includes(p.path.split('/')[1])).map(p => (
            <Route key={`page:${p.id}`} path={p.path} element={<CustomPage page={p} />} />
          ))}
          {navRedirects().map(item => (
            <Route key={item.path} path={item.path} element={<ExternalRedirect href={item.href} />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      </Suspense>
      {structureFlag('footer') && <Footer />}
    </>
  )
}

export const SITE_FONTS = [
  { value: '',                  label: 'Red Hat Display',   google: 'Red+Hat+Display:ital,wght@0,300..900;1,300..900' },
  { value: 'Inter',             label: 'Inter',             google: 'Inter:wght@300..700' },
  { value: 'Poppins',          label: 'Poppins',           google: 'Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500' },
  { value: 'DM Sans',          label: 'DM Sans',           google: 'DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700' },
  { value: 'Manrope',          label: 'Manrope',           google: 'Manrope:wght@300..700' },
  { value: 'Outfit',           label: 'Outfit',            google: 'Outfit:wght@300..700' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', google: 'Plus+Jakarta+Sans:ital,wght@0,300..700;1,300..700' },
  { value: 'Geist',            label: 'Geist',             google: 'Geist:wght@300..700' },
  { value: 'Nunito Sans',      label: 'Nunito Sans',       google: 'Nunito+Sans:ital,opsz,wght@0,6..12,300..700;1,6..12,300..700' },
  { value: 'Space Grotesk',    label: 'Space Grotesk',     google: 'Space+Grotesk:wght@300..700' },
  { value: 'Epilogue',         label: 'Epilogue',          google: 'Epilogue:ital,wght@0,300..700;1,300..700' },
  { value: 'system-ui',        label: 'System UI',         google: null },
]

// Any Google Fonts family name works here, not just the SITE_FONTS presets —
// custom names are requested with a common weight list since we can't know
// ahead of time which weights a given family actually ships.
const googleFontQuery = (name) => `${name.trim().replace(/\s+/g, '+')}:wght@300;400;500;600;700`

export function applyFont(fontValue, fallback, fallbackEverywhere) {
  if (fontValue === 'system-ui') {
    const fallbackStack = fallback
      ? `'${fallback}', `
      : ''
    // fallbackEverywhere puts the fallback font ahead of -apple-system/Segoe UI,
    // so it also wins on Apple/Windows instead of only showing up where neither exists.
    document.documentElement.style.setProperty(
      '--site-font',
      fallback && fallbackEverywhere
        ? `${fallbackStack}-apple-system, BlinkMacSystemFont, 'Segoe UI', var(--cjk-font,) sans-serif`
        : `-apple-system, BlinkMacSystemFont, 'Segoe UI', ${fallbackStack}var(--cjk-font,) sans-serif`
    )
    if (fallback) {
      const googleFont = SITE_FONTS.find(f => f.value === fallback)
      const id = 'site-font-fallback-link'
      let link = document.getElementById(id)
      if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link) }
      link.href = `https://fonts.googleapis.com/css2?family=${googleFont?.google || googleFontQuery(fallback)}&display=swap`
    }
    return
  }
  const font = SITE_FONTS.find(f => f.value === fontValue)
  const id = 'site-font-link'
  let link = document.getElementById(id)
  if (!link) {
    link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  const family = font ? font.google : (fontValue ? googleFontQuery(fontValue) : null)
  if (family) link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`
  document.documentElement.style.setProperty(
    '--site-font',
    fontValue ? `'${fontValue}', var(--cjk-font,) sans-serif` : "'Red Hat Display', var(--cjk-font,) sans-serif"
  )
}

export default function App() {
  useEffect(() => {
    if (siteConfig.fontFamily) applyFont(siteConfig.fontFamily, siteConfig.fontFallback, siteConfig.fontFallbackEverywhere)
  }, [])

  return (
    <BrowserRouter basename={BASENAME || undefined}>
      <ScrollToTop />
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
