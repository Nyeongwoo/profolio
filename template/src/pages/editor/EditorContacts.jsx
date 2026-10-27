import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, TextField, Field, Row, Card, Toggle } from './EditorComponents'
import SectionsEditor from './EditorSectionsEditor'

export default function EditorContacts() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(d => {
      if (!d.contactsSections) d.contactsSections = []
      setData(d)
    })
  }, [])

  const save = async () => {
    await fetch(`${API}/page/siteConfig`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div className="ed-page">
      <EditorTopbar title="Contacts" onSave={save} saved={saved} extra={
        <button onClick={() => setData(d => ({ ...d, contactsMaintenance: !d.contactsMaintenance }))} title={data.contactsMaintenance ? 'Under maintenance — click to make this page public again' : 'Public — click to put just this page under maintenance'} style={{
          border: data.contactsMaintenance ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
          borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          background: data.contactsMaintenance ? '#fff0f0' : 'var(--ed-input-bg)',
          color: data.contactsMaintenance ? '#e53e3e' : 'var(--ed-text-sub)',
          transition: 'all 0.15s',
        }}>
          {data.contactsMaintenance ? '🔒 Maintenance' : '🌐 Public'}
        </button>
      } />
      <EditorSectionNav sections={[
        { id: 'ed-contacts-intro', label: 'Intro' },
        { id: 'ed-contacts-sections', label: 'Sections' },
        { id: 'ed-contacts-form', label: 'Form' },
        { id: 'ed-contacts-form-style', label: 'Form Style' },
        { id: 'ed-contacts-form-fields', label: 'Form Fields' },
      ]} />

      <Card id="ed-contacts-intro" title="Intro" collapsible defaultOpen>
        <Row>
          <Field label="Gap Above — desktop (px, space between navbar and this section)">
            <input style={s} type="number" min="0" placeholder="Default (60)" value={data.contactsIntroTopGap ?? ''} onChange={e => setData(d => ({ ...d, contactsIntroTopGap: e.target.value || undefined }))} />
          </Field>
          <Field label="Gap Above — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Default (40)" value={data.contactsIntroTopGapMobile ?? ''} onChange={e => setData(d => ({ ...d, contactsIntroTopGapMobile: e.target.value || undefined }))} />
          </Field>
          <Field label="Gap — title to description — desktop (px)">
            <input style={s} type="number" min="0" placeholder="Default (20)" value={data.contactsIntroTitleGap ?? ''} onChange={e => setData(d => ({ ...d, contactsIntroTitleGap: e.target.value || undefined }))} />
          </Field>
          <Field label="Gap — title to description — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={data.contactsIntroTitleGapMobile ?? ''} onChange={e => setData(d => ({ ...d, contactsIntroTitleGapMobile: e.target.value || undefined }))} />
          </Field>
        </Row>
        <TextField label="Title" value={data.contactsIntroTitle || ''} onChange={v => setData(d => ({ ...d, contactsIntroTitle: v }))}
          size={data.contactsIntroTitleSize} onSize={v => setData(d => ({ ...d, contactsIntroTitleSize: v }))}
          weight={data.contactsIntroTitleWeight} onWeight={v => setData(d => ({ ...d, contactsIntroTitleWeight: v }))}
          color={data.contactsIntroTitleColor} onColor={v => setData(d => ({ ...d, contactsIntroTitleColor: v }))}
          font={data.contactsIntroTitleFont} onFont={v => setData(d => ({ ...d, contactsIntroTitleFont: v }))}  rich />
        <TextField label="Description" value={data.contactsIntroDescription || ''} onChange={v => setData(d => ({ ...d, contactsIntroDescription: v }))}
          size={data.contactsIntroDescSize} onSize={v => setData(d => ({ ...d, contactsIntroDescSize: v }))}
          weight={data.contactsIntroDescWeight} onWeight={v => setData(d => ({ ...d, contactsIntroDescWeight: v }))}
          color={data.contactsIntroDescColor} onColor={v => setData(d => ({ ...d, contactsIntroDescColor: v }))}
          font={data.contactsIntroDescFont} onFont={v => setData(d => ({ ...d, contactsIntroDescFont: v }))}
          multiline rows={4}  rich />
      </Card>

      <Card id="ed-contacts-sections" title="Additional Sections" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Appended below the intro — same section types (images, image+text, carousels, tabs, video, stats, etc.) as the Home/About/Category editors. Build your contact links here (e.g. Image + Text with a link) — freely add, reorder, hide, or delete them.
        </div>
        <SectionsEditor
          sections={data.contactsSections || []}
          onChange={v => setData(d => ({ ...d, contactsSections: v }))}
          basePath="/assets/contacts/sections"
          uploadUrl={`${API}/contacts-images/upload`}
          mobileBasePath="/assets/contacts/sections/mobile"
          mobileUploadUrl={`${API}/contacts-images/mobile/upload`}
          tabletBasePath="/assets/contacts/sections/tablet"
          tabletUploadUrl={`${API}/contacts-images/tablet/upload`}
        />
      </Card>

      <Card id="ed-contacts-form" title="Form" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Renders below the sections above. Submissions are delivered via <a href="https://formspree.io" target="_blank" rel="noreferrer">Formspree</a> — create a free form there and paste its endpoint URL below (e.g. https://formspree.io/f/xxxxxxxx). The form stays hidden until an endpoint is set.
        </div>
        <Field label="Formspree Endpoint URL">
          <input style={s} value={data.contactsFormEndpoint || ''} onChange={e => setData(d => ({ ...d, contactsFormEndpoint: e.target.value || undefined }))} placeholder="https://formspree.io/f/xxxxxxxx" />
        </Field>
        <Toggle label="Show contact form" checked={data.contactsFormEnabled !== false} onChange={v => setData(d => ({ ...d, contactsFormEnabled: v }))} hint="Turn off to hide the form even if an endpoint is set." />
      </Card>

      <Card id="ed-contacts-form-style" title="Form Style" collapsible defaultOpen>
        <Field label="Font">
          <select style={s} value={data.contactsFormFont || 'inherit'} onChange={e => setData(d => ({ ...d, contactsFormFont: e.target.value }))}>
            <option value="inherit">Default</option>
            <option value="Georgia, serif">Serif</option>
            <option value="'Courier New', monospace">Mono</option>
          </select>
        </Field>
        <Row>
          <Field label="Label Color">
            <input style={s} type="color" value={data.contactsFormLabelColor || '#111111'} onChange={e => setData(d => ({ ...d, contactsFormLabelColor: e.target.value }))} />
          </Field>
          <Field label="Input Text Color">
            <input style={s} type="color" value={data.contactsFormInputColor || '#111111'} onChange={e => setData(d => ({ ...d, contactsFormInputColor: e.target.value }))} />
          </Field>
          <Field label="Underline Color">
            <input style={s} type="color" value={data.contactsFormLineColor || '#dddddd'} onChange={e => setData(d => ({ ...d, contactsFormLineColor: e.target.value }))} />
          </Field>
        </Row>
        <Row>
          <Field label="Button Text">
            <input style={s} value={data.contactsFormButtonText || ''} onChange={e => setData(d => ({ ...d, contactsFormButtonText: e.target.value }))} placeholder="Send message" />
          </Field>
          <Field label="Button Background">
            <input style={s} type="color" value={data.contactsFormButtonColor || '#111111'} onChange={e => setData(d => ({ ...d, contactsFormButtonColor: e.target.value }))} />
          </Field>
          <Field label="Button Text Color">
            <input style={s} type="color" value={data.contactsFormButtonTextColor || '#ffffff'} onChange={e => setData(d => ({ ...d, contactsFormButtonTextColor: e.target.value }))} />
          </Field>
          <Field label="Button Corner Radius (px)">
            <input style={s} type="number" min="0" placeholder="Default (10)" value={data.contactsFormButtonRadius ?? ''} onChange={e => setData(d => ({ ...d, contactsFormButtonRadius: e.target.value || undefined }))} />
          </Field>
        </Row>
        <Field label="Success Message (shown after sending)">
          <input style={s} value={data.contactsFormSuccessText || ''} onChange={e => setData(d => ({ ...d, contactsFormSuccessText: e.target.value }))} placeholder="Thanks — your message has been sent." />
        </Field>
      </Card>

      <Card id="ed-contacts-form-fields" title="Form Fields" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Name, Email, Subject, and Message are always present. Add extra fields here — e.g. a "이메일 수신 동의" checkbox — they're appended below Message and included in every submission.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(data.contactsFormFields || []).map((f, i) => {
            const fields = data.contactsFormFields || []
            const update = (key, val) => setData(d => ({ ...d, contactsFormFields: fields.map((x, j) => j === i ? { ...x, [key]: val } : x) }))
            const move = (dir) => {
              const t = i + dir
              if (t < 0 || t >= fields.length) return
              const next = [...fields]
              ;[next[i], next[t]] = [next[t], next[i]]
              setData(d => ({ ...d, contactsFormFields: next }))
            }
            const remove = () => setData(d => ({ ...d, contactsFormFields: fields.filter((_, j) => j !== i) }))
            return (
              <div key={f.id} style={{ border: '1px solid var(--ed-divider)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Row>
                  <Field label="Type">
                    <select style={s} value={f.type} onChange={e => update('type', e.target.value)}>
                      <option value="checkbox">Checkbox</option>
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text</option>
                    </select>
                  </Field>
                  <Field label="Label">
                    <input style={s} value={f.label || ''} onChange={e => update('label', e.target.value)} placeholder={f.type === 'checkbox' ? 'I agree to receive emails' : 'Company'} />
                  </Field>
                  {f.type !== 'checkbox' && (
                    <Field label="Placeholder">
                      <input style={s} value={f.placeholder || ''} onChange={e => update('placeholder', e.target.value)} />
                    </Field>
                  )}
                </Row>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--ed-text)' }}>
                    <input type="checkbox" checked={!!f.required} onChange={e => update('required', e.target.checked)} />
                    Required
                  </label>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => move(-1)} style={{ border: '1px solid var(--ed-input-border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }}>↑</button>
                  <button onClick={() => move(1)} style={{ border: '1px solid var(--ed-input-border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }}>↓</button>
                  <button onClick={remove} style={{ border: '1px solid #ffccc7', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: '#e53e3e' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
        <button
          onClick={() => setData(d => ({ ...d, contactsFormFields: [...(d.contactsFormFields || []), { id: `f_${Date.now()}`, type: 'checkbox', label: '', required: false }] }))}
          style={{ marginTop: '4px', background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}
        >
          + Add Field
        </button>
      </Card>
    </div>
  )
}
