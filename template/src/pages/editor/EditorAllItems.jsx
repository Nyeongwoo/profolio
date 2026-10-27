import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, Card, FontSizeSelect, HOVER_STYLES, TogglePill, Toggle } from './EditorComponents'
import SectionsEditor from './EditorSectionsEditor'

// Everything that actually differs between "All Projects" and "All Originals"
// lives here — the two pages were near-identical ~500-line copies of each
// other, diverging only in field/endpoint names and two features
// (Confidential is projects-only, per-category hide toggle is originals-only).
const TYPE_CONFIG = {
  projects: {
    title: 'All Projects',
    itemNoun: 'project',
    itemsEndpoint: 'projects',
    categoryOrderKey: 'projectCategoryOrder',
    categoryLabelsKey: 'projectCategoryLabels',
    hiddenCategoriesKey: 'hiddenProjectCategories',
    hiddenInAllKey: 'hiddenInAllProjects',
    categoryTextKey: 'projectsCategoryText',
    configPrefix: 'allProjects',
    visibilityTitle: 'Featured Tab',
    visibilityDesc: 'The Projects landing tab is a curated "Featured" selection. Toggle which projects appear there and set their order with ↑ ↓ — every project still appears in its own category tab. Also toggleable from each project\'s editor page (★ Featured, next to Title).',
    otherCardTitle: 'Other Projects (bottom of every project detail page)',
    otherCardDesc: 'The "Other Projects" heading and related-icons row shown at the bottom of every project detail page. Leave blank to use the default.',
    newCategoryPlaceholder: 'New category name (e.g. news)',
    hasConfidential: true,
    hasFeaturedOrder: true,
    badgeColors: [
      { color: '#e6f4ea', text: '#1e8e3e' },
      { color: '#e8f0fe', text: '#1a73e8' },
      { color: '#fce8b2', text: '#f29900' },
      { color: '#fce8e6', text: '#d93025' },
      { color: '#f3e8fd', text: '#9334e6' },
      { color: '#e0f7fa', text: '#00838f' },
      { color: '#fff3e0', text: '#e65100' },
      { color: '#f0f0f0', text: '#555555' },
    ],
  },
  originals: {
    title: 'All Originals',
    itemNoun: 'original',
    itemsEndpoint: 'originals',
    categoryOrderKey: 'originalCategoryOrder',
    categoryLabelsKey: 'originalCategoryLabels',
    hiddenCategoriesKey: 'hiddenOriginalCategories',
    hiddenInAllKey: 'hiddenInAllOriginals',
    categoryTextKey: 'originalsCategoryText',
    configPrefix: 'allOriginals',
    visibilityTitle: 'All Tab Visibility',
    visibilityDesc: 'Items hidden here are hidden only in the All tab. They still appear in their category tab.',
    otherCardTitle: 'Other Originals (bottom of every original detail page)',
    otherCardDesc: 'The "Other Originals" heading and related-icons row shown at the bottom of every original detail page. Shared with the same card on the All Projects page. Leave blank to use the default.',
    newCategoryPlaceholder: 'New category name (e.g. music)',
    hasConfidential: false,
    badgeColors: [
      { color: '#f3e8fd', text: '#9334e6' },
      { color: '#e0f7fa', text: '#00838f' },
      { color: '#fff3e0', text: '#e65100' },
      { color: '#e6f4ea', text: '#1e8e3e' },
      { color: '#e8f0fe', text: '#1a73e8' },
      { color: '#fce8b2', text: '#f29900' },
      { color: '#fce8e6', text: '#d93025' },
      { color: '#f0f0f0', text: '#555555' },
    ],
  },
}

const LAYOUTS = [
  { value: '1', label: '1 col (feed)', preview: '▌' },
  { value: '2', label: '2 col', preview: '▌▌' },
  { value: '3', label: '3 col', preview: '▌▌▌' },
  { value: '4', label: '4 col', preview: '▌▌▌▌' },
]

const MOBILE_LAYOUTS = [
  { value: '1', label: '1 col', preview: '▌' },
  { value: '2', label: '2 col', preview: '▌▌' },
  { value: '3', label: '3 col', preview: '▌▌▌' },
]

const RATIOS = [
  { value: '16/9', label: '16:9' },
  { value: '4/3',  label: '4:3' },
  { value: '5/4',  label: '5:4' },
  { value: '1/1',  label: '1:1' },
]

const getBadge = (cat, allCats, colors) => {
  const idx = allCats.indexOf(cat)
  return colors[(idx >= 0 ? idx : colors.length - 1) % colors.length]
}

// Title/caption colors + drop shadow for a Featured card. Used once for the
// defaults of every card and again per project row (an override: any field
// left unset there falls back to the default). `value` is a plain object:
// { titleColor, captionColor, shadow (false = off), shadowColor, shadowOpacity }.
function CardTextControls({ value = {}, onChange, inherit }) {
  const set = (k, v) => { const n = { ...value, [k]: v }; if (v === undefined || v === '') delete n[k]; onChange(n) }
  const eff = { ...inherit, ...value }
  const swatch = { width: '26px', height: '22px', padding: 0, border: '1px solid var(--ed-input-border)', borderRadius: '5px', background: 'none', cursor: 'pointer', flexShrink: 0 }
  const small = { border: '1px solid var(--ed-input-border)', borderRadius: '5px', padding: '2px 7px', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }
  const label = (text, own) => <span style={{ fontSize: '11px', color: own ? 'var(--ed-text)' : 'var(--ed-text-muted)', fontWeight: own ? 600 : 400 }}>{text}</span>
  const shadowOn = eff.shadow !== false
  const has = Object.keys(value).length > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <input type="color" value={eff.titleColor || '#ffffff'} onChange={e => set('titleColor', e.target.value)} style={swatch} />
        {label('Title', 'titleColor' in value)}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <input type="color" value={eff.captionColor || '#ffffff'} onChange={e => set('captionColor', e.target.value)} style={swatch} />
        {label('Caption', 'captionColor' in value)}
      </span>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
        <input type="checkbox" checked={shadowOn} onChange={e => set('shadow', e.target.checked ? (inherit?.shadow === false ? true : undefined) : false)} />
        {label('Shadow', 'shadow' in value)}
      </label>
      {shadowOn && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <input type="color" value={eff.shadowColor || '#000000'} onChange={e => set('shadowColor', e.target.value)} style={swatch} />
          <input type="range" min="0" max="100" value={eff.shadowOpacity ?? 50} onChange={e => set('shadowOpacity', Number(e.target.value))} style={{ width: '80px' }} />
          <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)', fontVariantNumeric: 'tabular-nums', width: '28px' }}>{eff.shadowOpacity ?? 50}%</span>
        </span>
      )}
      {has && <button onClick={() => onChange({})} style={small}>{inherit ? 'Use default' : 'Reset'}</button>}
    </div>
  )
}

export default function EditorAllItems({ type }) {
  const cfg = TYPE_CONFIG[type]
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [hiddenCategories, setHiddenCategories] = useState([])
  const [hiddenInAll, setHiddenInAll] = useState([])
  const [featuredOrder, setFeaturedOrder] = useState([])
  const [layout, setLayout] = useState('3')
  const [mobileLayout, setMobileLayout] = useState('1')
  const [text, setText] = useState('')
  const [categoryText, setCategoryText] = useState({})
  const [categoryLabels, setCategoryLabels] = useState({})
  const [titleSize, setTitleSize] = useState('')
  const [tagSize, setTagSize] = useState('')
  const [iconGap, setIconGap] = useState('8px')
  const [allTitleSize, setAllTitleSize] = useState('')
  const [allTitleSizeMobile, setAllTitleSizeMobile] = useState('')
  const [allTitleTopGap, setAllTitleTopGap] = useState('')
  const [allTitleTopGapTablet, setAllTitleTopGapTablet] = useState('')
  const [allTitleTopGapMobile, setAllTitleTopGapMobile] = useState('')
  // "Other Projects"/"Other Originals" related-items list at the bottom of
  // every detail page — same siteConfig keys shared by both pages.
  const emptyTiers = () => ({ desktop: '', tablet: '', mobile: '' })
  const [othersIconSize, setOthersIconSize] = useState(emptyTiers())
  const [othersTitleSize, setOthersTitleSize] = useState(emptyTiers())
  const [othersTitleGap, setOthersTitleGap] = useState(emptyTiers())
  const [othersIconGap, setOthersIconGap] = useState(emptyTiers())
  const [othersTitleBold, setOthersTitleBold] = useState(false)
  const [saved, setSaved] = useState(false)
  const [renaming, setRenaming] = useState({}) // cat -> new name draft
  const [renameError, setRenameError] = useState({})
  const [renameLoading, setRenameLoading] = useState(null)
  const [newCatName, setNewCatName] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteError, setDeleteError] = useState({})
  const [deleteLoading, setDeleteLoading] = useState(null)
  const [hoverStyle, setHoverStyle] = useState('overlay')
  const [captions, setCaptions] = useState({})
  const [imageRatio, setImageRatio] = useState('16/9')
  const [confidentialItems, setConfidentialItems] = useState([])
  const [sections, setSections] = useState([])
  const [rightCaptions, setRightCaptions] = useState({})
  const [captionSwap, setCaptionSwap] = useState(false)
  const [cardText, setCardText] = useState({})
  // cardText = { ...defaults, items: { 'category/id': { ...overrides } } }
  const { items: cardItems = {}, ...cardDefaults } = cardText
  const setCardItem = (key, v) => setCardText(c => {
    const items = { ...(c.items || {}) }
    if (Object.keys(v).length) items[key] = v; else delete items[key]
    const n = { ...c, items }
    if (!Object.keys(items).length) delete n.items
    return n
  })
  const [titleGap, setTitleGap] = useState('')
  const [titleGapMobile, setTitleGapMobile] = useState('')

  const loadAll = () => {
    Promise.all([
      fetch(`${API}/${cfg.itemsEndpoint}`).then(r => r.json()),
      fetch(`${API}/page/siteConfig`).then(r => r.json()),
    ]).then(([data, siteCfg]) => {
      setItems(data)
      const derived = [...new Set(data.map(x => x.category))]
      // Also fold in any category that only exists via saved per-category
      // description text — including a category just created via "+ Add"
      // that has no items in it yet (add-category writes this text key
      // immediately, before any project/original is added to it).
      const textKeys = Object.keys(siteCfg[cfg.categoryTextKey] || {})
      const allDerived = [...new Set([...derived, ...textKeys])]
      const order = siteCfg[cfg.categoryOrderKey] || []
      setCategories(order.length
        ? [...order.filter(c => allDerived.includes(c)), ...allDerived.filter(c => !order.includes(c))]
        : allDerived
      )
      setCategoryLabels(siteCfg[cfg.categoryLabelsKey] || {})
      setIconGap(siteCfg.iconCarouselMobileGap || '8px')
      if (cfg.hiddenCategoriesKey) setHiddenCategories(siteCfg[cfg.hiddenCategoriesKey] || [])
      setAllTitleSize(siteCfg.categoryHeroTitleSize?.all || '')
      setAllTitleSizeMobile(siteCfg.categoryHeroTitleSizeMobile?.all || '')
      setAllTitleTopGap(siteCfg.categoryTitleTopGap?.all || '')
      setAllTitleTopGapTablet(siteCfg.categoryTitleTopGapTablet?.all || '')
      setAllTitleTopGapMobile(siteCfg.categoryTitleTopGapMobile?.all || '')
      setOthersIconSize({ desktop: siteCfg.othersIconSize || '', tablet: siteCfg.othersIconSizeTablet || '', mobile: siteCfg.othersIconSizeMobile || '' })
      setOthersTitleSize({ desktop: siteCfg.othersTitleSize || '', tablet: siteCfg.othersTitleSizeTablet || '', mobile: siteCfg.othersTitleSizeMobile || '' })
      setOthersTitleGap({ desktop: siteCfg.othersTitleGap || '', tablet: siteCfg.othersTitleGapTablet || '', mobile: siteCfg.othersTitleGapMobile || '' })
      setOthersIconGap({ desktop: siteCfg.othersIconGap || '', tablet: siteCfg.othersIconGapTablet || '', mobile: siteCfg.othersIconGapMobile || '' })
      setOthersTitleBold(!!siteCfg.othersTitleBold)
    })
    fetch(`${API}/all-config`).then(r => r.json()).then(d => {
      setHiddenInAll(d[cfg.hiddenInAllKey] || [])
      if (cfg.hasFeaturedOrder) setFeaturedOrder(d.featuredOrder || [])
      setLayout(d[`${cfg.configPrefix}Layout`] || '3')
      setMobileLayout(d[`${cfg.configPrefix}MobileLayout`] || '1')
      setText(d[`${cfg.configPrefix}Text`] || '')
      setCategoryText(d[cfg.categoryTextKey] || {})
      setTitleSize(d[`${cfg.configPrefix}TitleSize`] || '')
      setTagSize(d[`${cfg.configPrefix}TagSize`] || '')
      setHoverStyle(d[`${cfg.configPrefix}HoverStyle`] || (d[`${cfg.configPrefix}CaptionEnabled`] === false ? 'plain' : 'overlay'))
      setCaptions(d[`${cfg.configPrefix}Captions`] || {})
      setImageRatio(d[`${cfg.configPrefix}ImageRatio`] || '16/9')
      setSections(d[`${cfg.configPrefix}Sections`] || [])
      setRightCaptions(d[`${cfg.configPrefix}RightCaptions`] || {})
      setCaptionSwap(!!d[`${cfg.configPrefix}CaptionSwap`])
      if (cfg.hasFeaturedOrder) setCardText(d.allProjectsCardText || {})
      setTitleGap(d[`${cfg.configPrefix}TitleGap`] || '')
      setTitleGapMobile(d[`${cfg.configPrefix}TitleGapMobile`] || '')
      if (cfg.hasConfidential) setConfidentialItems(d.confidentialProjects || [])
    })
  }

  useEffect(() => { loadAll() }, [type])

  const toggle = (key) =>
    setHiddenInAll(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const toggleConfidential = (key) =>
    setConfidentialItems(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const toggleCategoryHidden = (cat) =>
    setHiddenCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])

  const save = async () => {
    const siteCfg = await fetch(`${API}/page/siteConfig`).then(r => r.json())
    const withAll = (obj, val) => {
      const next = { ...(obj || {}) }
      if (val) next.all = val
      else delete next.all
      return next
    }
    await fetch(`${API}/page/siteConfig`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...siteCfg,
        [cfg.categoryLabelsKey]: categoryLabels,
        [cfg.categoryOrderKey]: categories,
        iconCarouselMobileGap: iconGap,
        ...(cfg.hiddenCategoriesKey ? { [cfg.hiddenCategoriesKey]: hiddenCategories } : {}),
        categoryHeroTitleSize: withAll(siteCfg.categoryHeroTitleSize, allTitleSize),
        categoryHeroTitleSizeMobile: withAll(siteCfg.categoryHeroTitleSizeMobile, allTitleSizeMobile),
        categoryTitleTopGap: withAll(siteCfg.categoryTitleTopGap, allTitleTopGap),
        categoryTitleTopGapTablet: withAll(siteCfg.categoryTitleTopGapTablet, allTitleTopGapTablet),
        categoryTitleTopGapMobile: withAll(siteCfg.categoryTitleTopGapMobile, allTitleTopGapMobile),
        othersIconSize: othersIconSize.desktop || undefined,
        othersIconSizeTablet: othersIconSize.tablet || undefined,
        othersIconSizeMobile: othersIconSize.mobile || undefined,
        othersTitleSize: othersTitleSize.desktop || undefined,
        othersTitleSizeTablet: othersTitleSize.tablet || undefined,
        othersTitleSizeMobile: othersTitleSize.mobile || undefined,
        othersTitleGap: othersTitleGap.desktop || undefined,
        othersTitleGapTablet: othersTitleGap.tablet || undefined,
        othersTitleGapMobile: othersTitleGap.mobile || undefined,
        othersIconGap: othersIconGap.desktop || undefined,
        othersIconGapTablet: othersIconGap.tablet || undefined,
        othersIconGapMobile: othersIconGap.mobile || undefined,
        othersTitleBold: othersTitleBold || undefined,
      }),
    })

    await fetch(`${API}/all-config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(cfg.hasConfidential ? { confidentialProjects: confidentialItems } : {}),
        ...(cfg.hasFeaturedOrder ? { featuredOrder: listKeys } : {}),
        [cfg.hiddenInAllKey]: hiddenInAll,
        [`${cfg.configPrefix}Layout`]: layout,
        [`${cfg.configPrefix}MobileLayout`]: mobileLayout,
        [`${cfg.configPrefix}Text`]: text,
        [cfg.categoryTextKey]: categoryText,
        [`${cfg.configPrefix}TitleSize`]: titleSize,
        [`${cfg.configPrefix}TagSize`]: tagSize,
        [`${cfg.configPrefix}HoverStyle`]: hoverStyle,
        [`${cfg.configPrefix}CaptionEnabled`]: hoverStyle !== 'plain',
        [`${cfg.configPrefix}Captions`]: captions,
        [`${cfg.configPrefix}ImageRatio`]: imageRatio,
        [`${cfg.configPrefix}Sections`]: sections,
        [`${cfg.configPrefix}RightCaptions`]: rightCaptions,
        [`${cfg.configPrefix}CaptionSwap`]: captionSwap,
        ...(cfg.hasFeaturedOrder ? { allProjectsCardText: cardText } : {}),
        [`${cfg.configPrefix}TitleGap`]: titleGap,
        [`${cfg.configPrefix}TitleGapMobile`]: titleGapMobile,
      }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const moveCategory = (i, dir) => setCategories(cats => {
    const next = [...cats]
    const t = i + dir
    if (t < 0 || t >= next.length) return cats
    ;[next[i], next[t]] = [next[t], next[i]]
    return next
  })

  const startRename = (cat) => setRenaming(r => ({ ...r, [cat]: cat }))
  const cancelRename = (cat) => setRenaming(r => { const n = { ...r }; delete n[cat]; return n })

  const doRename = async (cat) => {
    const to = (renaming[cat] || '').trim()
    if (!to || to === cat) return cancelRename(cat)
    setRenameError(e => ({ ...e, [cat]: '' }))
    setRenameLoading(cat)
    const res = await fetch(`${API}/rename-category`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, from: cat, to }),
    })
    const data = await res.json()
    setRenameLoading(null)
    if (!res.ok) {
      setRenameError(e => ({ ...e, [cat]: data.error || 'Error' }))
      return
    }
    window.dispatchEvent(new CustomEvent('categories-changed'))
    loadAll()
    cancelRename(cat)
  }

  const doAdd = async () => {
    const name = newCatName.trim()
    if (!name) return
    setAddError('')
    setAddLoading(true)
    const res = await fetch(`${API}/add-category`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name }),
    })
    const data = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(data.error || 'Error'); return }
    setNewCatName('')
    window.dispatchEvent(new CustomEvent('categories-changed'))
    loadAll()
  }

  const doDelete = async (cat) => {
    setDeleteError(e => ({ ...e, [cat]: '' }))
    setDeleteLoading(cat)
    const res = await fetch(`${API}/delete-category`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name: cat }),
    })
    const data = await res.json()
    setDeleteLoading(null)
    setDeleteConfirm(null)
    if (!res.ok) { setDeleteError(e => ({ ...e, [cat]: data.error || 'Error' })); return }
    loadAll()
  }

  const sorted = [...items].sort((a, b) => (a.order || 0) - (b.order || 0))
  // Featured tab list: hand-set order first (featuredOrder), anything not in
  // it yet after, by its own order. Saving writes the whole visible order
  // back, so newly added projects get pinned where they currently sit.
  const rank = (x) => { const i = featuredOrder.indexOf(`${x.category}/${x.id}`); return i === -1 ? Infinity : i }
  const visibilityList = cfg.hasFeaturedOrder ? [...sorted].sort((a, b) => rank(a) - rank(b)) : sorted
  const listKeys = visibilityList.map(x => `${x.category}/${x.id}`)
  const moveFeatured = (idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= listKeys.length) return
    const next = [...listKeys]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setFeaturedOrder(next)
  }
  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', flex: 1, minWidth: 0, boxSizing: 'border-box' }
  const btnSm = { border: '1px solid var(--ed-input-border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }

  return (
    <div className="ed-page">
      <EditorTopbar title={cfg.title} onSave={save} saved={saved} />
      <EditorSectionNav sections={[
        { id: 'ed-items-categories', label: 'Categories' },
        { id: 'ed-items-other', label: 'Other Card' },
        { id: 'ed-items-desc', label: 'Description' },
        { id: 'ed-items-text-size', label: 'Text Size' },
        { id: 'ed-items-hover', label: 'Hover Style' },
        { id: 'ed-items-layout', label: 'Layout' },
        { id: 'ed-items-cat-text', label: 'Category Text' },
        ...(cfg.hasConfidential ? [{ id: 'ed-items-confidential', label: 'Confidential' }] : []),
        { id: 'ed-items-visibility', label: 'Visibility' },
        { id: 'ed-items-sections', label: 'Sections' },
      ]} />

      {/* Categories */}
      <Card id="ed-items-categories" title="Categories" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '10px' }}>
          <b>Tab label</b>: display name shown in the tab — takes effect on Save.<br />
          <b>Rename ID</b>: changes the folder name (internal ID) — data and hidden settings update automatically, page refreshes.
        </div>
        <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--ed-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text-muted)', flex: '0 0 100px' }}>all</span>
            <input
              style={{ ...s, flex: 1 }}
              placeholder="Tab label (default: All)"
              value={categoryLabels.all || ''}
              onChange={e => setCategoryLabels(l => ({ ...l, all: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flex: '0 0 100px' }} />
            <input style={{ ...s, flex: 1 }} value={allTitleSize} onChange={e => setAllTitleSize(e.target.value)} placeholder="Title Size (Desktop)" />
            <input style={{ ...s, flex: 1 }} value={allTitleSizeMobile} onChange={e => setAllTitleSizeMobile(e.target.value)} placeholder="Title Size (Mobile)" />
            <input style={{ ...s, flex: 1 }} value={allTitleTopGap} onChange={e => setAllTitleTopGap(e.target.value)} placeholder="Title Top Gap (Desktop)" />
            <input style={{ ...s, flex: 1 }} value={allTitleTopGapTablet} onChange={e => setAllTitleTopGapTablet(e.target.value)} placeholder="Title Top Gap (Tablet)" />
            <input style={{ ...s, flex: 1 }} value={allTitleTopGapMobile} onChange={e => setAllTitleTopGapMobile(e.target.value)} placeholder="Title Top Gap (Mobile)" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {categories.map((cat, idx) => {
            const badge = getBadge(cat, categories, cfg.badgeColors)
            const isRenaming = renaming[cat] !== undefined
            const isLoading = renameLoading === cat
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0} style={{ ...btnSm, padding: '1px 5px', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveCategory(idx, 1)} disabled={idx === categories.length - 1} style={{ ...btnSm, padding: '1px 5px', opacity: idx === categories.length - 1 ? 0.3 : 1 }}>↓</button>
                </div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: badge.text, flexShrink: 0 }} />
                {isRenaming ? (
                  <>
                    <input
                      style={{ ...s, flex: '0 0 150px' }}
                      value={renaming[cat]}
                      onChange={e => setRenaming(r => ({ ...r, [cat]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') doRename(cat); if (e.key === 'Escape') cancelRename(cat) }}
                      autoFocus
                      placeholder="New ID (folder name)"
                    />
                    <button onClick={() => doRename(cat)} disabled={isLoading} style={{ ...btnSm, background: '#111', color: '#fff', border: 'none', fontWeight: 600 }}>
                      {isLoading ? '...' : 'Rename'}
                    </button>
                    <button onClick={() => cancelRename(cat)} style={btnSm}>Cancel</button>
                    {renameError[cat] && <span style={{ fontSize: '11px', color: '#e53e3e' }}>{renameError[cat]}</span>}
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text-muted)', flex: '0 0 100px' }}>{cat}</span>
                    <input
                      style={{ ...s, flex: 1 }}
                      placeholder={`Tab label (default: ${cat.charAt(0).toUpperCase() + cat.slice(1)})`}
                      value={categoryLabels[cat] || ''}
                      onChange={e => setCategoryLabels(l => ({ ...l, [cat]: e.target.value }))}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>
                      {items.filter(x => x.category === cat).length} items
                    </span>
                    {cfg.hiddenCategoriesKey && (
                      <button
                        onClick={() => toggleCategoryHidden(cat)}
                        title="Hide this tab from the category filter bar — items stay reachable by direct link"
                        style={{ ...btnSm, flexShrink: 0, background: hiddenCategories.includes(cat) ? '#fff0f0' : btnSm.background, color: hiddenCategories.includes(cat) ? '#e53e3e' : btnSm.color, fontWeight: hiddenCategories.includes(cat) ? 600 : 400 }}
                      >
                        {hiddenCategories.includes(cat) ? 'Hidden' : 'Visible'}
                      </button>
                    )}
                    <button onClick={() => startRename(cat)} style={btnSm}>Rename ID</button>
                    {deleteConfirm === cat ? (
                      <>
                        <span style={{ fontSize: '11px', color: '#e53e3e', flexShrink: 0 }}>Are you sure?</span>
                        <button onClick={() => doDelete(cat)} disabled={deleteLoading === cat} style={{ ...btnSm, background: '#e53e3e', color: '#fff', border: 'none', fontWeight: 600, flexShrink: 0 }}>
                          {deleteLoading === cat ? '...' : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...btnSm, flexShrink: 0 }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(cat)} style={{ ...btnSm, color: '#e53e3e', flexShrink: 0 }}>Delete</button>
                    )}
                    {deleteError[cat] && <span style={{ fontSize: '11px', color: '#e53e3e' }}>{deleteError[cat]}</span>}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            style={{ ...s, flex: '0 0 200px' }}
            placeholder={cfg.newCategoryPlaceholder}
            value={newCatName}
            onChange={e => { setNewCatName(e.target.value); setAddError('') }}
            onKeyDown={e => { if (e.key === 'Enter') doAdd() }}
          />
          <button
            onClick={doAdd}
            disabled={addLoading}
            style={{ ...btnSm, background: '#111', color: '#fff', border: 'none', fontWeight: 600 }}
          >{addLoading ? '...' : '+ Add'}</button>
          {addError && <span style={{ fontSize: '11px', color: '#e53e3e' }}>{addError}</span>}
        </div>
      </Card>

      <Card id="ed-items-other" title={cfg.otherCardTitle} collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '14px' }}>
          {cfg.otherCardDesc}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: '8px', fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-xmuted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span></span>
            <span>🖥 Desktop</span>
            <span>💻 Tablet</span>
            <span>📱 Mobile</span>
          </div>
          {[
            { label: 'Title Size', state: othersTitleSize, setState: setOthersTitleSize, ph: '24px' },
            { label: 'Title–Icons Gap', state: othersTitleGap, setState: setOthersTitleGap, ph: '32px' },
            { label: 'Icon Size', state: othersIconSize, setState: setOthersIconSize, ph: '200px / 120px (mobile)' },
            { label: 'Icon–Icon Gap', state: othersIconGap, setState: setOthersIconGap, ph: '12px' },
          ].map(({ label, state, setState, ph }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text-muted)' }}>{label}</span>
              <input style={s} value={state.desktop} onChange={e => setState(v => ({ ...v, desktop: e.target.value }))} placeholder={`Default (${ph})`} />
              <input style={s} value={state.tablet} onChange={e => setState(v => ({ ...v, tablet: e.target.value }))} placeholder="Same as Desktop" />
              <input style={s} value={state.mobile} onChange={e => setState(v => ({ ...v, mobile: e.target.value }))} placeholder="Same as Desktop" />
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ed-text)', cursor: 'pointer', marginTop: '2px' }}>
            <input type="checkbox" checked={othersTitleBold} onChange={e => setOthersTitleBold(e.target.checked)} />
            Bold title
          </label>
        </div>
      </Card>

      <Card id="ed-items-desc" title="Description Text" collapsible defaultOpen>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Leave blank to hide from view"
          rows={3}
          style={{ border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </Card>

      <Card id="ed-items-text-size" title="Card Text Size" collapsible defaultOpen>
        <div style={{ display: 'flex', gap: '16px' }}>
          <FontSizeSelect label="Title" value={titleSize} onChange={setTitleSize} />
          <FontSizeSelect label="Tag" value={tagSize} onChange={setTagSize} />
        </div>
      </Card>

      <Card id="ed-items-hover" title="Hover Style" collapsible defaultOpen>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {HOVER_STYLES.map(opt => {
            const active = hoverStyle === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setHoverStyle(opt.value)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start',
                  padding: '10px 14px', borderRadius: '9px', cursor: 'pointer', minWidth: '160px',
                  border: active ? '1.5px solid var(--ed-accent)' : '1.5px solid var(--ed-input-border)',
                  background: active ? 'color-mix(in srgb, var(--ed-accent) 8%, var(--ed-card-bg))' : 'var(--ed-input-bg)',
                  color: active ? 'var(--ed-accent)' : 'var(--ed-text-sub)',
                  fontFamily: 'inherit', transition: 'all 0.1s',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{opt.label}</span>
                <span style={{ fontSize: '10.5px', opacity: 0.75, color: active ? 'var(--ed-accent)' : 'var(--ed-text-muted)' }}>{opt.desc}</span>
              </button>
            )
          })}
        </div>
        <Toggle
          label="Swap Caption Sides (title+tag caption ↔ bottom-right caption)"
          checked={captionSwap}
          onChange={setCaptionSwap}
          onLabel="Swapped (title on right)" offLabel="Default (title on left)"
        />
        {cfg.hasFeaturedOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Card Text — default for every card</div>
            <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Each project can override these in the Featured Tab list below.</div>
            <CardTextControls value={cardDefaults} onChange={v => setCardText(c => ({ ...v, ...(c.items ? { items: c.items } : {}) }))} />
          </div>
        )}
      </Card>

      <Card id="ed-items-layout" title="Layout" collapsible defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Gap — Title to First Card</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...s, width: '120px' }} type="number" min="0" value={titleGap} onChange={e => setTitleGap(e.target.value)} placeholder="Default (32px)" />
              <input style={{ ...s, width: '140px' }} type="number" min="0" value={titleGapMobile} onChange={e => setTitleGapMobile(e.target.value)} placeholder="Mobile — same as desktop" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>📱 Icon Thumbnail Gap (Mobile)</div>
            <input style={{ ...s, width: '120px' }} value={iconGap} onChange={e => setIconGap(e.target.value)} placeholder="e.g. 8px" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>🖥 Desktop — Columns</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {LAYOUTS.map(opt => (
                <button key={opt.value} onClick={() => setLayout(opt.value)} style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: layout === opt.value ? '2px solid var(--ed-nav-active-bg)' : '2px solid var(--ed-input-border)', background: layout === opt.value ? 'var(--ed-nav-active-bg)' : 'var(--ed-input-bg)', color: layout === opt.value ? 'var(--ed-nav-active-text)' : 'var(--ed-text-sub)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px', letterSpacing: '3px' }}>{opt.preview}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>🖥 Desktop — Image Ratio</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {RATIOS.map(opt => (
                <button key={opt.value} onClick={() => setImageRatio(opt.value)} style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, border: imageRatio === opt.value ? '2px solid var(--ed-nav-active-bg)' : '2px solid var(--ed-input-border)', background: imageRatio === opt.value ? 'var(--ed-nav-active-bg)' : 'var(--ed-input-bg)', color: imageRatio === opt.value ? 'var(--ed-nav-active-text)' : 'var(--ed-text-sub)' }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginTop: '8px', lineHeight: 1.6 }}>
              📐 Every card is cropped to this one ratio. Each {cfg.itemNoun}'s own image is set on its own editor page ("All Thumbnail (Grid)") — prepare it at least 1920px wide in this ratio (2x for retina) so it isn't upscaled.
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>📱 Mobile — Columns</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {MOBILE_LAYOUTS.map(opt => (
                <button key={opt.value} onClick={() => setMobileLayout(opt.value)} style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: mobileLayout === opt.value ? '2px solid var(--ed-nav-active-bg)' : '2px solid var(--ed-input-border)', background: mobileLayout === opt.value ? 'var(--ed-nav-active-bg)' : 'var(--ed-input-bg)', color: mobileLayout === opt.value ? 'var(--ed-nav-active-text)' : 'var(--ed-text-sub)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px', letterSpacing: '3px' }}>{opt.preview}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card id="ed-items-cat-text" title="Category Description Text" collapsible defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{cat}</div>
              <textarea
                value={categoryText[cat] || ''}
                onChange={e => setCategoryText(prev => ({ ...prev, [cat]: e.target.value }))}
                placeholder="Leave blank to hide"
                rows={2}
                style={{ border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          ))}
        </div>
      </Card>

      {cfg.hasConfidential && (
        <Card id="ed-items-confidential" title="Confidential Projects (NDA)" collapsible defaultOpen>
          <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
            Marked projects show an orange gradient with "Confidential" on hover.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {sorted.map(x => {
              const key = `${x.category}/${x.id}`
              const isConfidential = confidentialItems.includes(key)
              return (
                <div key={key} style={{ borderRadius: '8px', background: 'var(--ed-card-bg)', border: `1px solid ${isConfidential ? '#f97316' : 'var(--ed-divider)'}`, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ed-text)' }}>{x.id}</span>
                    <button
                      onClick={() => toggleConfidential(key)}
                      style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: isConfidential ? '#fff4ee' : 'var(--ed-input-bg)', color: isConfidential ? '#ea580c' : 'var(--ed-text-muted)' }}
                    >
                      {isConfidential ? 'Confidential (NDA)' : 'Public'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Card id="ed-items-visibility" title={cfg.visibilityTitle} collapsible defaultOpen>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          {cfg.visibilityDesc}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {visibilityList.map((x, idx) => {
            const key = `${x.category}/${x.id}`
            const globallyHidden = x.hidden
            const hiddenHere = hiddenInAll.includes(key)
            const badge = getBadge(x.category, categories, cfg.badgeColors)
            return (
              <div key={key} style={{ borderRadius: '8px', background: globallyHidden ? 'var(--ed-head-bg)' : 'var(--ed-card-bg)', border: '1px solid var(--ed-divider)', opacity: globallyHidden ? 0.45 : 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: badge.color, color: badge.text, textTransform: 'uppercase' }}>{x.category}</span>
                    <span style={{ fontSize: '13px', color: 'var(--ed-text)' }}>{x.id}</span>
                    {globallyHidden && <span style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)' }}>globally hidden</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {cfg.hasFeaturedOrder && <>
                      <button onClick={() => moveFeatured(idx, -1)} disabled={idx === 0} title="Move up" style={{ ...btnSm, opacity: idx === 0 ? 0.35 : 1 }}>↑</button>
                      <button onClick={() => moveFeatured(idx, 1)} disabled={idx === visibilityList.length - 1} title="Move down" style={{ ...btnSm, opacity: idx === visibilityList.length - 1 ? 0.35 : 1, marginRight: '6px' }}>↓</button>
                    </>}
                    <TogglePill checked={!hiddenHere} onChange={() => toggle(key)} disabled={globallyHidden} />
                  </div>
                </div>
                {hoverStyle !== 'plain' && (
                  <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--ed-divider)', display: 'flex', gap: '8px' }}>
                    <input
                      style={{ ...s, fontSize: '11px', marginTop: '8px', flex: 1 }}
                      placeholder={`Caption (default: ${(x.tags || []).join(', ') || 'no tags'})`}
                      value={captions[key] ?? ''}
                      onChange={e => setCaptions(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                    <input
                      style={{ ...s, fontSize: '11px', marginTop: '8px', flex: 1 }}
                      placeholder="Bottom-right caption (optional)"
                      value={rightCaptions[key] ?? ''}
                      onChange={e => setRightCaptions(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                )}
                {cfg.hasFeaturedOrder && hoverStyle !== 'plain' && (
                  <div style={{ padding: '0 12px 10px' }}>
                    <CardTextControls value={cardItems[key]} inherit={cardDefaults} onChange={v => setCardItem(key, v)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card id="ed-items-sections" title="Additional Sections" collapsible defaultOpen={false}>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Appended below the {cfg.title} grid — same section types (images, image+text, carousels, tabs, video, stats, etc.) as the Home/About/Category editors. Freely add, reorder, hide, or delete them.
        </div>
        <SectionsEditor
          sections={sections}
          onChange={setSections}
          basePath={`/assets/${cfg.itemsEndpoint}/all/sections`}
          uploadUrl={`${API}/${type === 'projects' ? 'all-projects-images' : 'all-originals-images'}/upload`}
          mobileBasePath={`/assets/${cfg.itemsEndpoint}/all/sections/mobile`}
          mobileUploadUrl={`${API}/${type === 'projects' ? 'all-projects-images' : 'all-originals-images'}/mobile/upload`}
          tabletBasePath={`/assets/${cfg.itemsEndpoint}/all/sections/tablet`}
          tabletUploadUrl={`${API}/${type === 'projects' ? 'all-projects-images' : 'all-originals-images'}/tablet/upload`}
        />
      </Card>
    </div>
  )
}
