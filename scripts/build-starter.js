#!/usr/bin/env node
// The starter site Profolio's File ▸ New Site… begins from:
//
//   node scripts/build-starter.js [out.zip]   (default: the app's resources)
//
// template/ is the site's code with sample content, kept in this repository
// as it should land in a new site's repository. Run by
// scripts/release-profolio.sh before every build; the zip isn't committed.
// It holds:
//
//   site/       template/ as git would commit it, plus AGENTS.md / CLAUDE.md
//   editor/     the editor build for its .portfolio package, so a new site
//               needs no Node on the Mac that makes it
//   starter.json  what it was built from
//   presets.json  layout presets New Site offers (settings merged on top)
//   types.json    site types New Site offers
//
// The app pushes site/ to a new repository and builds the package from it;
// File ▸ Update Site… brings existing sites' code up to this site/.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = path.join(ROOT, 'template')

const line = (kind, text, size, weight) => ({ kind, text, size, weight, color: '', font: '' })
const year = new Date().getFullYear()

// Sample projects the template's content was made from; Showcase features
// the first two.
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

// Site types New Site offers. Portfolio is the starter as built; the others
// reshape it: `remove` drops starter files (path prefixes), `write` puts
// whole files in (JSON values, or SVG/text strings), and `merge` sets keys
// in a JSON file. Applied before a layout preset.
function organizationType() {
  const date = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return t.toISOString().slice(0, 10).replace(/-/g, '/') }
  const text = (label, head, body) => ({ id: `${label}-${Math.random().toString(36).slice(2, 6)}`, label, type: 'text', images: [],
    blocks: [{ images: [], mobileImages: [], hoverImages: [], title: '', subtitle: '', content: '' }],
    lines: [{ ...line('subtitle', label, '21px', '700'), color: '#919191', gapAfter: 12 }, line('title', head, '32px', '700'), line('body', body, '17px', '500')] })
  const events = [
    { id: 'annual-conference', category: 'conferences', title: 'Annual Conference', hue: 210,
      date: 'Spring', venue: 'Main Hall', organizer: 'Program Committee',
      overview: 'Our yearly gathering of members and guests: talks, paper sessions and a chance to meet.' },
    { id: 'members-exhibition', category: 'exhibitions', title: 'Members’ Exhibition', hue: 32,
      date: 'Autumn', venue: 'Gallery', organizer: 'Exhibition Committee',
      overview: 'Work by our members, shown together once a year.' },
  ]
  const posts = [
    { id: 'welcome', category: 'notices', title: 'Welcome to our new website', date: date(1),
      preview: 'Notices, events and our members, all in one place.' },
    { id: 'call-for-papers', category: 'news', title: 'Call for papers is open', date: date(8),
      preview: 'Submissions for this year’s conference are now open.' },
  ]
  const people = [
    { name: 'Jane Doe', role: 'President', affiliation: 'University', bio: 'A sentence about her work.', photo: '__placeholder__', featured: true },
    { name: 'John Smith', role: 'Vice President', affiliation: 'Studio', bio: '', photo: '__placeholder__' },
    { name: 'Alex Kim', role: 'Secretary', affiliation: 'College', bio: '', photo: '__placeholder__' },
    { name: 'Sam Lee', role: 'Member', affiliation: '', bio: '', photo: '__placeholder__' },
  ]
  const write = {
    'src/data/projects.json': events.map((e, i) => ({ id: e.id, category: e.category, title: e.title, description: e.overview, year, order: i + 1, overview: e.overview, sections: [], tags: [] })),
    'src/data/blog.json': posts.map(p => ({ ...p, thumbnail: '', content: '' })),
    'src/data/pages.json': [{ id: 'people', title: 'People', path: '/people' }],
    'src/data/home.json': {
      hero: { desktopRatio: 'full', mobileRatio: 'full', inset: false, bgColor: '' },
      featuredSection: {}, featured: [], gridSections: [], homeOriginals: [],
      originalsSection: { showTitle: false, showDesc: false, description: '', hidden: true },
      sections: [
        text('About', 'Who we are, in one line.', 'A short introduction to the organization and what it does. Edit it in Profolio ▸ Home.'),
        { id: 'Notices-home', label: 'Notices', type: 'recent-posts', images: [], count: 4,
          lines: [{ ...line('subtitle', 'Notices', '21px', '700'), color: '#919191', gapAfter: 12 }, line('title', 'Latest news', '32px', '700')] },
      ],
    },
    'src/data/about.json': {
      intro: { title: 'About', description: 'What the organization is, who it is for, and how to take part.', profileImage: '', hideProfile: true },
      sections: [text('Mission', 'What we do.', 'Our mission, history and the work we support. Add sections in Profolio ▸ About.')],
      photos: { heading: '', items: [] }, resume: { name: '', subtitle: '', sections: [] },
    },
    'public/assets/pages/people/info.json': {
      title: 'People', description: 'Our board and members.',
      sections: [{ id: 'People-list', label: 'People', type: 'people', images: [], featuredLabel: 'Member of the Month', people, lines: [] }],
    },
    'public/assets/projects/conferences/category-info.json': { sections: [] },
    'public/assets/projects/exhibitions/category-info.json': { sections: [] },
  }
  for (const e of events) {
    write[`public/assets/projects/${e.category}/${e.id}/info.json`] = {
      overviewTitle: e.title, overview: e.overview, type: '', duration: e.date, team: e.organizer, role: e.venue,
      sections: [text('About', `About the ${e.title.toLowerCase()}.`, 'Program, speakers and how to join. Replace this with the real details.'),
                 { id: `Photos-${e.id}`, label: 'Photos', type: 'images', images: [1], blocks: [] }],
    }
    const key = `${e.category}-${e.id}`
    write[`public/assets/projects/all-thumbnails/${key}.svg`] = placeholderSVG(1200, 900, e.hue, e.title)
    write[`public/assets/projects/icon-thumbnails/${key}.svg`] = placeholderSVG(400, 400, e.hue, e.title)
    write[`public/assets/projects/${e.category}/${e.id}/hero.svg`] = placeholderSVG(1600, 900, e.hue, e.title)
    write[`public/assets/projects/${e.category}/${e.id}/sections/01.svg`] = placeholderSVG(1600, 1000, (e.hue + 20) % 360, 'Add your photos')
  }
  for (const p of posts) write[`public/assets/blog/${p.id}/info.json`] = { sections: [text('Notice', p.title, p.preview)] }
  write['public/assets/home/hero.svg'] = placeholderSVG(1600, 900, 160, 'Your organization')
  return {
    id: 'organization', name: 'Organization', description: 'A society, club or team: notices, events, people.',
    remove: ['public/assets/projects/work/', 'public/assets/projects/personal/', 'public/assets/projects/all-thumbnails/', 'public/assets/projects/icon-thumbnails/'],
    write,
    merge: {
      'src/data/siteConfig.json': {
        structure: {
          nav: [{ key: 'about' }, { key: 'blog' }, { key: 'projects' }, { key: 'page', page: 'people' }, { key: 'contacts' }],
          sections: { originals: false, blog: true, archive: false },
          names: { projects: 'Events', blog: 'Notices' },
          projectIcons: false,
        },
        blogCategories: [{ id: 'notices', label: 'Notices' }, { id: 'news', label: 'News' }],
        projectCategoryOrder: ['conferences', 'exhibitions'],
        projectsCategoryText: { conferences: '', exhibitions: '' },
        projectCategoryLabels: { all: 'All Events' },
        projectMetaLabels: { team: 'ORGANIZER', duration: 'DATE', role: 'VENUE' },
        allProjectsImageRatio: '4/3',
        footerColumns: [
          { title: 'Events', items: [{ label: 'Conferences', link: '/projects/conferences' }, { label: 'Exhibitions', link: '/projects/exhibitions' }] },
          { title: 'About', items: [{ label: 'About', link: '/about' }, { label: 'People', link: '/people' }, { label: 'Contact', link: '/contacts' }] },
        ],
      },
    },
  }
}

const TYPES = [
  { id: 'portfolio', name: 'Portfolio', description: 'Your work: projects, about, contact.', remove: [], write: {}, merge: {} },
  organizationType(),
]

async function main() {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'mac/SiteEditor/StarterSite.zip'))
  const git = (...args) => execFileSync('git', args, { cwd: TEMPLATE, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 64 })
  if (!fs.existsSync(path.join(TEMPLATE, 'node_modules'))) {
    console.log('  installing the template\'s packages (npm ci)…')
    execFileSync('npm', ['ci', '--silent'], { cwd: TEMPLATE, stdio: 'inherit' })
  }
  // Imported only now: the editor build needs the template's node_modules.
  const { installEditor } = await import(path.join(TEMPLATE, 'scripts/siteproj.js'))

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'profolio-starter-'))
  const site = path.join(stage, 'site')
  // Working-tree files git would commit (tracked + untracked, minus
  // ignored), so a template edit can be tried before it's committed.
  const files = [...new Set(git('ls-files', '-z', '-c', '-o', '--exclude-standard', '.').split('\0').filter(Boolean))]
    .filter(p => fs.existsSync(path.join(TEMPLATE, p)))
  for (const p of files) {
    fs.mkdirSync(path.dirname(path.join(site, p)), { recursive: true })
    fs.copyFileSync(path.join(TEMPLATE, p), path.join(site, p))
  }
  // The guide for coding agents: one source (Profolio's help, which its own
  // Assistant reads too), as AGENTS.md (Codex and others) and CLAUDE.md
  // (Claude Code, which imports it).
  fs.copyFileSync(path.join(ROOT, 'mac/SiteEditor/Help/site-guide.md'), path.join(site, 'AGENTS.md'))
  fs.writeFileSync(path.join(site, 'CLAUDE.md'), '@AGENTS.md\n')

  const editor = await installEditor(stage)   // → stage/editor
  fs.writeFileSync(path.join(stage, 'starter.json'), JSON.stringify({ builtFrom: editor.commit, builtAt: editor.builtAt }, null, 2))
  fs.writeFileSync(path.join(stage, 'presets.json'), JSON.stringify(PRESETS, null, 2))
  fs.writeFileSync(path.join(stage, 'types.json'), JSON.stringify(TYPES, null, 2))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.rmSync(out, { force: true })
  execFileSync('ditto', ['-c', '-k', '--norsrc', stage + '/', out])
  fs.rmSync(stage, { recursive: true, force: true })
  console.log(`  starter site: ${files.length} files${editor.dirty ? ' (with uncommitted template changes)' : ''} → ${out}`)
}

main().catch(e => { console.error(`Error: ${e.message}`); process.exit(1) })
