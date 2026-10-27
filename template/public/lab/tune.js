// Lab tuning panel — live controls for a lab piece's effect settings.
// A piece loads this only when opened with ?tune, then calls:
//
//   LabTune.open({
//     title,            panel heading
//     file,             where Save writes, e.g. 'lab/doaa/effects.json'
//     values,           the piece's live settings object, { group: { key: value } };
//                       the panel edits it in place
//     schema,           [{ group, key, fields: [field…] }] — a field is
//                         { key, label, min, max, step, unit }        slider
//                         { key, label, type: 'bezier' }              [x1, y1, x2, y2]
//                         { key, label, type: 'keyframes', min, max } [[t, v]…], t in 0…1
//     onChange,         called after every edit
//     actions,          { 'Button label': fn } extra buttons, e.g. Replay
//   })
//
// Save goes to the Vite dev server (vite.config.js, labTuneSave) or to
// Profolio's Lab preview, which take the same request; Copy JSON works
// anywhere.
;(function () {
  const NS = 'http://www.w3.org/2000/svg'

  const CSS = `
  .labtune { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 320px; z-index: 1000;
    display: flex; flex-direction: column; background: rgba(255,255,255,0.97); color: #111;
    border: 1px solid #ddd; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.14);
    font: 12px/1.4 'Red Hat Display', system-ui, sans-serif; }
  .labtune.is-collapsed { bottom: auto; }
  .labtune.is-collapsed .labtune-body, .labtune.is-collapsed .labtune-foot { display: none; }
  .labtune-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eee; }
  .labtune-head strong { flex: 1; font-size: 13px; }
  .labtune button { font: inherit; border: 1px solid #d4d4d4; background: #fff; border-radius: 6px; padding: 4px 9px; cursor: pointer; }
  .labtune button:hover { background: #f4f4f4; }
  .labtune button.primary { background: #111; color: #fff; border-color: #111; }
  .labtune-body { overflow-y: auto; flex: 1; padding: 4px 0 8px; }
  .labtune details { border-bottom: 1px solid #f0f0f0; }
  .labtune summary { padding: 9px 12px; font-weight: 600; cursor: pointer; user-select: none; }
  .labtune-field { padding: 5px 12px; }
  .labtune-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px; color: #555; }
  .labtune-row input[type=number] { width: 70px; font: inherit; border: 1px solid #ddd; border-radius: 4px; padding: 2px 4px; text-align: right; }
  .labtune input[type=range] { width: 100%; margin: 0; accent-color: #ff6a1f; }
  .labtune svg { display: block; width: 100%; background: #fafafa; border: 1px solid #eee; border-radius: 6px; touch-action: none; }
  .labtune .grid { stroke: #ececec; stroke-width: 1; }
  .labtune .curve { fill: none; stroke: #ff6a1f; stroke-width: 2; }
  .labtune .arm { stroke: #aaa; stroke-width: 1; stroke-dasharray: 3 3; }
  .labtune .handle { fill: #fff; stroke: #111; stroke-width: 1.5; cursor: grab; }
  .labtune .hint { color: #999; font-size: 11px; margin-top: 3px; }
  .labtune select { font: inherit; border: 1px solid #ddd; border-radius: 4px; padding: 1px 2px; }
  .labtune-foot { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-top: 1px solid #eee; }
  .labtune-status { width: 100%; color: #888; font-size: 11px; }
  .labtune-status.is-dirty { color: #ff6a1f; }
  `

  const BEZIER_PRESETS = {
    linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
    'out-cubic': [0.33, 1, 0.68, 1], 'in-out-cubic': [0.65, 0, 0.35, 1], 'out-back': [0.34, 1.56, 0.64, 1],
  }

  function svgEl(name, attrs, parent) {
    const n = document.createElementNS(NS, name)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    if (parent) parent.appendChild(n)
    return n
  }
  const round = (v, step) => {
    const d = String(step).includes('.') ? String(step).split('.')[1].length : 0
    return Number((Math.round(v / step) * step).toFixed(d))
  }

  // Pointer dragging inside an SVG, in its viewBox units.
  function drag(svg, target, onMove, onEnd) {
    target.addEventListener('pointerdown', e => {
      e.preventDefault()
      e.stopPropagation()
      target.setPointerCapture(e.pointerId)
      const move = ev => {
        const pt = svg.createSVGPoint()
        pt.x = ev.clientX; pt.y = ev.clientY
        const p = pt.matrixTransform(svg.getScreenCTM().inverse())
        onMove(p.x, p.y)
      }
      const up = () => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        onEnd && onEnd()
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    })
  }

  // ── fields ────────────────────────────────────────────────────────────
  function slider(obj, f, changed) {
    const wrap = document.createElement('div')
    wrap.className = 'labtune-field'
    const row = document.createElement('div')
    row.className = 'labtune-row'
    const label = document.createElement('span')
    label.textContent = f.unit ? `${f.label} (${f.unit})` : f.label
    const num = document.createElement('input')
    num.type = 'number'
    Object.assign(num, { min: f.min, max: f.max, step: f.step ?? 'any', value: obj[f.key] })
    const range = document.createElement('input')
    range.type = 'range'
    Object.assign(range, { min: f.min, max: f.max, step: f.step ?? 'any', value: obj[f.key] })
    const set = v => {
      if (!Number.isFinite(v)) return
      obj[f.key] = v
      num.value = v
      range.value = v
      changed()
    }
    range.addEventListener('input', () => set(Number(range.value)))
    num.addEventListener('change', () => set(Number(num.value)))
    row.append(label, num)
    wrap.append(row, range)
    return wrap
  }

  function bezier(obj, f, changed) {
    const wrap = document.createElement('div')
    wrap.className = 'labtune-field'
    const row = document.createElement('div')
    row.className = 'labtune-row'
    const label = document.createElement('span')
    label.textContent = f.label
    const preset = document.createElement('select')
    preset.innerHTML = '<option value="">Preset…</option>' +
      Object.keys(BEZIER_PRESETS).map(k => `<option>${k}</option>`).join('')
    row.append(label, preset)

    // 0…1 maps to 20…180, with room above and below for overshoot.
    const S = 160, O = 20
    const svg = svgEl('svg', { viewBox: `0 -20 200 240` })
    const X = v => O + v * S, Y = v => O + (1 - v) * S
    for (let i = 0; i <= 4; i++) {
      svgEl('line', { x1: X(i / 4), y1: Y(0), x2: X(i / 4), y2: Y(1), class: 'grid' }, svg)
      svgEl('line', { x1: X(0), y1: Y(i / 4), x2: X(1), y2: Y(i / 4), class: 'grid' }, svg)
    }
    const arm1 = svgEl('line', { class: 'arm' }, svg)
    const arm2 = svgEl('line', { class: 'arm' }, svg)
    const path = svgEl('path', { class: 'curve' }, svg)
    const h1 = svgEl('circle', { r: 6, class: 'handle' }, svg)
    const h2 = svgEl('circle', { r: 6, class: 'handle' }, svg)
    const text = document.createElement('div')
    text.className = 'hint'

    const draw = () => {
      const [x1, y1, x2, y2] = obj[f.key]
      path.setAttribute('d', `M${X(0)},${Y(0)} C${X(x1)},${Y(y1)} ${X(x2)},${Y(y2)} ${X(1)},${Y(1)}`)
      Object.entries({ x1: X(0), y1: Y(0), x2: X(x1), y2: Y(y1) }).forEach(([k, v]) => arm1.setAttribute(k, v))
      Object.entries({ x1: X(1), y1: Y(1), x2: X(x2), y2: Y(y2) }).forEach(([k, v]) => arm2.setAttribute(k, v))
      h1.setAttribute('cx', X(x1)); h1.setAttribute('cy', Y(y1))
      h2.setAttribute('cx', X(x2)); h2.setAttribute('cy', Y(y2))
      text.textContent = `cubic-bezier(${obj[f.key].join(', ')})`
    }
    const handle = (h, i) => drag(svg, h, (px, py) => {
      const v = obj[f.key].slice()
      v[i] = round(Math.min(1, Math.max(0, (px - O) / S)), 0.01)
      v[i + 1] = round(Math.min(1.5, Math.max(-0.5, 1 - (py - O) / S)), 0.01)
      obj[f.key] = v
      draw()
      changed()
    })
    handle(h1, 0)
    handle(h2, 2)
    preset.addEventListener('change', () => {
      if (!preset.value) return
      obj[f.key] = BEZIER_PRESETS[preset.value].slice()
      preset.value = ''
      draw()
      changed()
    })
    draw()
    wrap.append(row, svg, text)
    return wrap
  }

  function keyframes(obj, f, changed) {
    const wrap = document.createElement('div')
    wrap.className = 'labtune-field'
    const row = document.createElement('div')
    row.className = 'labtune-row'
    row.textContent = f.label
    const W = 260, H = 120, P = 10
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` })
    const X = t => P + t * (W - 2 * P)
    const Y = v => H - P - ((v - f.min) / (f.max - f.min)) * (H - 2 * P)
    const T = x => Math.min(1, Math.max(0, (x - P) / (W - 2 * P)))
    const V = y => Math.min(f.max, Math.max(f.min, f.min + ((H - P - y) / (H - 2 * P)) * (f.max - f.min)))
    for (let i = 0; i <= 4; i++) {
      svgEl('line', { x1: X(i / 4), y1: P, x2: X(i / 4), y2: H - P, class: 'grid' }, svg)
      svgEl('line', { x1: P, y1: P + i * (H - 2 * P) / 4, x2: W - P, y2: P + i * (H - 2 * P) / 4, class: 'grid' }, svg)
    }
    const line = svgEl('polyline', { class: 'curve' }, svg)
    const handles = svgEl('g', {}, svg)
    const hint = document.createElement('div')
    hint.className = 'hint'

    const pts = () => obj[f.key]
    const draw = () => {
      obj[f.key] = pts().slice().sort((a, b) => a[0] - b[0])
      line.setAttribute('points', pts().map(([t, v]) => `${X(t)},${Y(v)}`).join(' '))
      handles.innerHTML = ''
      pts().forEach((p, i) => {
        const h = svgEl('circle', { cx: X(p[0]), cy: Y(p[1]), r: 5.5, class: 'handle' }, handles)
        const ends = i === 0 || i === pts().length - 1
        drag(svg, h, (px, py) => {
          // Ends stay at t = 0 and 1; inner points stay between neighbours.
          const prev = pts()[i - 1], next = pts()[i + 1]
          const t = ends ? p[0] : Math.min(next[0] - 0.01, Math.max(prev[0] + 0.01, T(px)))
          p[0] = round(t, 0.01)
          p[1] = round(V(py), 0.01)
          h.setAttribute('cx', X(p[0])); h.setAttribute('cy', Y(p[1]))
          line.setAttribute('points', pts().map(([a, b]) => `${X(a)},${Y(b)}`).join(' '))
          hint.textContent = `t ${p[0]} → ${p[1]}`
          changed()
        }, () => { hint.textContent = 'Drag points · double-click to add or remove' })
        if (!ends) h.addEventListener('dblclick', e => {
          e.stopPropagation()
          pts().splice(i, 1)
          draw()
          changed()
        })
      })
    }
    svg.addEventListener('dblclick', e => {
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const p = pt.matrixTransform(svg.getScreenCTM().inverse())
      const t = round(T(p.x), 0.01)
      if (t <= 0 || t >= 1) return
      pts().push([t, round(V(p.y), 0.01)])
      draw()
      changed()
    })
    hint.textContent = 'Drag points · double-click to add or remove'
    draw()
    wrap.append(row, svg, hint)
    return wrap
  }

  function format(values) {
    return JSON.stringify(values, null, 2)
      .replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`) + '\n'
  }

  // ── panel ─────────────────────────────────────────────────────────────
  function open({ title, file, values, schema, onChange, actions = {} }) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    const initial = JSON.parse(JSON.stringify(values))
    let saved = JSON.stringify(values)
    const panel = document.createElement('aside')
    panel.className = 'labtune'

    const head = document.createElement('div')
    head.className = 'labtune-head'
    const h = document.createElement('strong')
    h.textContent = title
    const collapse = document.createElement('button')
    collapse.textContent = '–'
    collapse.title = 'Collapse'
    collapse.addEventListener('click', () => {
      panel.classList.toggle('is-collapsed')
      collapse.textContent = panel.classList.contains('is-collapsed') ? '+' : '–'
    })
    head.append(h, collapse)

    const body = document.createElement('div')
    body.className = 'labtune-body'
    const status = document.createElement('div')
    status.className = 'labtune-status'
    const setStatus = (msg, dirty) => {
      status.textContent = msg
      status.classList.toggle('is-dirty', !!dirty)
    }
    const changed = () => {
      onChange && onChange()
      const dirty = JSON.stringify(values) !== saved
      setStatus(dirty ? 'Unsaved changes' : 'Saved', dirty)
    }

    const build = () => {
      body.innerHTML = ''
      schema.forEach((g, gi) => {
        const det = document.createElement('details')
        det.open = gi === 0
        const sum = document.createElement('summary')
        sum.textContent = g.group
        det.appendChild(sum)
        const obj = values[g.key]
        g.fields.forEach(f => {
          const make = f.type === 'bezier' ? bezier : f.type === 'keyframes' ? keyframes : slider
          det.appendChild(make(obj, f, changed))
        })
        body.appendChild(det)
      })
    }
    build()

    const foot = document.createElement('div')
    foot.className = 'labtune-foot'
    const button = (label, fn, cls) => {
      const b = document.createElement('button')
      b.textContent = label
      if (cls) b.className = cls
      b.addEventListener('click', fn)
      foot.appendChild(b)
      return b
    }
    Object.entries(actions).forEach(([label, fn]) => button(label, fn))
    button('Reset', () => {
      for (const k of Object.keys(initial)) values[k] = JSON.parse(JSON.stringify(initial[k]))
      build()
      changed()
    })
    button('Copy JSON', async () => {
      await navigator.clipboard.writeText(JSON.stringify(values, null, 2))
      setStatus('Copied to the clipboard')
    })
    button('Save', async () => {
      try {
        const res = await fetch('/__lab/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // `text` is the file as it should read: pretty-printed, arrays of
          // plain values on one line (Profolio's Lab writes it as is).
          body: JSON.stringify({ path: file, data: values, text: format(values) }),
        })
        if (!res.ok) throw new Error(res.status === 404 ? 'Saving needs the dev server (npm run dev)' : await res.text() || `HTTP ${res.status}`)
        saved = JSON.stringify(values)
        setStatus(`Saved to public/${file}`)
      } catch (e) {
        setStatus(`Not saved — ${e.message}. Use Copy JSON instead.`, true)
      }
    }, 'primary')
    foot.appendChild(status)
    setStatus('Saved')

    panel.append(head, body, foot)
    document.body.appendChild(panel)
  }

  window.LabTune = { open }
})()
