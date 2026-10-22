// The starter site Profolio's File ▸ New Site… begins from:
//
//   node scripts/siteproj.js starter [out.zip]   (default: the app's resources)
//
// This site's code with sample content in place of the real one — no names,
// contacts, analytics, passwords or Vercel link — plus the built editor, so
// a new site needs no Node on the Mac that makes it. The zip holds:
//
//   site/       the files for the new GitHub repository
//   editor/     the editor build for its .portfolio package
//   starter.json  what it was built from
//   presets.json  layout presets New Site offers (settings merged on top)
//
// The app pushes site/ to a new repository and builds the package from it.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// Repo files that are this site's own content or setup, not the starter's.
const EXCLUDE = [
  /^public\/assets\//, /^src\/data\/[^/]+\.json$/, /^src\/i18n\/(ko|zh)\.json$/, /^mac\//, /^docs\//,
  /^\.vercel\//, /^\.claude\//, /^server\/last-deploy\.json$/, /^othersEl\.offsetTop$/,
  /^public\/nnwoo-qr\.svg$/, /^public\/favicon(-1)?\.svg$/, /^public\/apple-touch-icon\.png$/, /^README\.md$/,
]
// Interface images the site's code expects (logos are replaced below).
const KEEP_ASSETS = ['public/assets/navbar/search.svg', 'public/assets/navbar/search-dark.svg', 'public/assets/icons/button.svg']

// siteConfig.json keys holding personal details or this site's content.
const CONFIG_RESET = {
  name: 'Your Name', tagline: '', email: '', instagram: '', linkedin: '', linkedinDisplayName: '', whatsapp: '',
  contactItems: [], cvFile: '', maintenance: false, maintenancePassword: '', maintenanceImage: '',
  hiddenProjects: [], hiddenOriginals: [], hiddenInAllProjects: [], hiddenInAllOriginals: [], hiddenProjectCategories: [], hiddenOriginalCategories: [],
  projectCategoryOrder: ['work', 'personal'], originalCategoryOrder: [], projectsCategoryText: { work: '', personal: '' }, originalsCategoryText: {},
  projectCategoryLabels: {}, originalCategoryLabels: {}, allProjectsCaptions: {}, allProjectsRightCaptions: {},
  allOriginalsCaptions: {}, allOriginalsRightCaptions: {}, confidentialProjects: [], navCustomItems: [], featuredOrder: [],
  footerColumns: [{ title: 'Projects', items: [{ label: 'Work', link: '/projects/work' }, { label: 'Personal', link: '/projects/personal' }] }],
  footerIconUrl: '', contactsSections: [], allProjectsSections: [], allOriginalsSections: [], contactsFormEndpoint: '',
  contactsIntroTitle: 'Contact', contactsIntroDescription: '', notFoundImage: '', allProjectsText: '', allOriginalsText: '',
}

const line = (kind, text, size, weight) => ({ kind, text, size, weight, color: '', font: '' })
const year = new Date().getFullYear()

// Sample projects, so a new site's layouts have something to show. Each gets
// placeholder images in its own color (see placeholderSVG).
const SAMPLES = [
  { id: 'sample-project', category: 'work', title: 'Sample Project', hue: 214, role: 'Product Design',
    overview: 'Describe the project in a few sentences: the problem, your role, the outcome.' },
  { id: 'brand-identity', category: 'work', title: 'Brand Identity', hue: 12, role: 'Visual Design',
    overview: 'A visual identity: the idea behind it, the system, and where it lives.' },
  { id: 'mobile-app', category: 'work', title: 'Mobile App', hue: 160, role: 'UX / UI',
    overview: 'An app from research to release — what people needed and what you built.' },
  { id: 'side-project', category: 'personal', title: 'Side Project', hue: 272, role: 'Everything',
    overview: 'Something made for yourself: why it exists and what you learned.' },
]

function sampleInfo(p) {
  return {
    overviewTitle: p.title, overview: p.overview,
    type: p.category === 'work' ? 'Client project' : 'Personal project', duration: String(year), team: '', role: p.role,
    metaFields: [{ key: 'type', label: 'Type' }, { key: 'duration', label: 'Duration' }, { key: 'role', label: 'Role' }],
    sections: [
      { id: `Overview-${p.id}`, label: 'Overview', type: 'text', images: [], blocks: [],
        lines: [line('subtitle', 'Overview', '21px', '700'), line('title', 'A first section.', '36px', '700'),
                line('body', 'Write about your work here. Add images and more sections from the inspector.', '17px', '500')] },
      { id: `Visuals-${p.id}`, label: 'Visuals', type: 'images', images: [1], blocks: [] },
    ],
  }
}

function starterContent(config) {
  return {
    'src/data/siteConfig.json': { ...config, ...CONFIG_RESET },
    'src/data/projects.json': SAMPLES.map((p, i) => ({ id: p.id, category: p.category, title: p.title, description: '', year, order: i + 1, overview: '', sections: [], tags: [] })),
    'src/data/originals.json': [],
    'src/data/blog.json': [],
    'src/data/archive.json': { title: 'Archive', description: '', items: [] },
    'src/data/home.json': {
      hero: { desktopRatio: 'full', mobileRatio: 'full', inset: false, bgColor: '' },
      featuredSection: {}, featured: [], gridSections: [], homeOriginals: [],
      originalsSection: { showTitle: false, showDesc: false, description: '' }, sections: [],
    },
    'src/data/about.json': {
      intro: { title: 'About', description: 'Write a short introduction about yourself.', profileImage: '' },
      sections: [], photos: { heading: '', items: [] }, resume: { name: '', subtitle: '', sections: [] },
    },
    'src/i18n/ko.json': { strings: {}, images: {} },
    'src/i18n/zh.json': { strings: {}, images: {} },
    'public/assets/blog/landing-info.json': { sections: [] },
    'public/assets/projects/work/category-info.json': { sections: [] },
    'public/assets/projects/personal/category-info.json': { sections: [] },
    ...Object.fromEntries(SAMPLES.map(p => [`public/assets/projects/${p.category}/${p.id}/info.json`, sampleInfo(p)])),
  }
}

/** A soft gradient with a label — stands in until real images are added. */
function placeholderSVG(width, height, hue, label) {
  const a = `hsl(${hue} 70% 62%)`, b = `hsl(${(hue + 40) % 360} 75% 45%)`
  const size = Math.round(Math.min(width, height) / 9)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#g)"/>
<text x="50%" y="50%" fill="#fff" fill-opacity="0.92" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>
`
}

function placeholders() {
  const out = {
    'public/assets/home/hero.svg': placeholderSVG(1600, 900, 220, 'Your work, front and center'),
    'public/assets/about/profile.svg': placeholderSVG(800, 800, 30, 'Your photo'),
  }
  for (const p of SAMPLES) {
    const key = `${p.category}-${p.id}`
    out[`public/assets/projects/all-thumbnails/${key}.svg`] = placeholderSVG(1200, 900, p.hue, p.title)
    out[`public/assets/projects/icon-thumbnails/${key}.svg`] = placeholderSVG(400, 400, p.hue, p.title)
    out[`public/assets/projects/${p.category}/${p.id}/hero.svg`] = placeholderSVG(1600, 900, p.hue, p.title)
    out[`public/assets/projects/${p.category}/${p.id}/sections/01.svg`] = placeholderSVG(1600, 1000, (p.hue + 20) % 360, 'Add your images')
  }
  return out
}

// Layout presets offered by New Site: settings merged into the starter's
// files (key by key) when a site is made. `preview` drives the picker's
// sketch: grid columns, image ratio, and whether Home leads with big cards.
const PRESETS = [
  { id: 'grid', name: 'Grid', description: 'A balanced grid of projects.',
    preview: { columns: 3, ratio: 4 / 3, featured: false },
    files: { 'src/data/siteConfig.json': { allProjectsLayout: '3', allProjectsMobileLayout: '1', allProjectsImageRatio: '4/3', allProjectsHoverStyle: 'zoom', fontFamily: '' } } },
  { id: 'showcase', name: 'Showcase', description: 'Big visuals; Home leads with two featured projects.',
    preview: { columns: 2, ratio: 16 / 10, featured: true },
    files: {
      'src/data/siteConfig.json': { allProjectsLayout: '2', allProjectsMobileLayout: '1', allProjectsImageRatio: '16/10', allProjectsHoverStyle: 'overlay', fontFamily: 'Manrope' },
      'src/data/home.json': { featured: SAMPLES.slice(0, 2).map(p => ({
        id: p.id, category: p.category, linkType: 'projects', image: `/assets/projects/all-thumbnails/${p.category}-${p.id}`,
        logo: '/assets/navbar/logo.svg', tagline: p.title, taglineSize: '28px', taglineColor: '#ffffff', logoGap: '16', logoHeightMobile: '32' })) },
    } },
  { id: 'feed', name: 'Feed', description: 'One project per row, like a story.',
    preview: { columns: 1, ratio: 16 / 9, featured: false },
    files: { 'src/data/siteConfig.json': { allProjectsLayout: '1', allProjectsMobileLayout: '1', allProjectsImageRatio: '16/9', allProjectsHoverStyle: 'plain', fontFamily: 'Inter' } } },
  { id: 'compact', name: 'Compact', description: 'Many projects at a glance.',
    preview: { columns: 4, ratio: 1, featured: false },
    files: { 'src/data/siteConfig.json': { allProjectsLayout: '4', allProjectsMobileLayout: '2', allProjectsImageRatio: '1/1', allProjectsHoverStyle: 'plain', fontFamily: 'Geist', tocBackgroundStyle: 'bar' } } },
]

// A plain mark for the logo and icon slots, to be replaced with your own.
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2F6FDB"/><circle cx="32" cy="32" r="12" fill="#fff"/></svg>\n'

function starterIndexHtml(html) {
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>Portfolio</title>')
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
    .replace(/\s*<script type="text\/javascript">[\s\S]*?clarity[\s\S]*?<\/script>/, '')
}

export async function buildStarter({ root, out, git, installEditor }) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pofole-starter-'))
  const site = path.join(stage, 'site')
  const files = git('ls-files', '-z').split('\0').filter(Boolean)
    .filter(p => !EXCLUDE.some(re => re.test(p)) || KEEP_ASSETS.includes(p))
    .filter(p => fs.existsSync(path.join(root, p)))
  for (const p of [...new Set([...files, ...KEEP_ASSETS])]) {
    fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
    fs.copyFileSync(path.join(root, p), path.join(site, p))
  }

  const config = JSON.parse(fs.readFileSync(path.join(root, 'src/data/siteConfig.json'), 'utf-8'))
  for (const [p, value] of Object.entries(starterContent(config))) {
    fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
    fs.writeFileSync(path.join(site, p), JSON.stringify(value, null, 2))
  }
  for (const [p, svg] of Object.entries(placeholders())) {
    fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
    fs.writeFileSync(path.join(site, p), svg)
  }
  for (const p of ['public/favicon.svg', 'public/assets/navbar/logo.svg', 'public/assets/navbar/logo-dark.svg', 'public/assets/footer/icon.svg']) {
    fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
    fs.writeFileSync(path.join(site, p), MARK)
  }
  // The footer's fallback name, for when the site has none.
  const footer = path.join(site, 'src/components/Footer.jsx')
  if (fs.existsSync(footer)) fs.writeFileSync(footer, fs.readFileSync(footer, 'utf-8').replace(/\|\| 'Nyeongwoo Kwon'/g, "|| ''"))
  fs.writeFileSync(path.join(site, 'index.html'), starterIndexHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf-8')))
  fs.writeFileSync(path.join(site, 'README.md'),
    '# Portfolio\n\nMade with [Profolio](https://nnwoo.com). Open this site’s `.portfolio` project in Profolio to edit and publish it.\n')

  const editor = await installEditor(stage)   // → stage/editor
  fs.writeFileSync(path.join(stage, 'starter.json'), JSON.stringify({ builtFrom: editor.commit, builtAt: editor.builtAt }, null, 2))
  fs.writeFileSync(path.join(stage, 'presets.json'), JSON.stringify(PRESETS, null, 2))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.rmSync(out, { force: true })
  execFileSync('ditto', ['-c', '-k', '--norsrc', stage + '/', out])
  const count = files.length
  fs.rmSync(stage, { recursive: true, force: true })
  return { files: count, out }
}
