import { useState } from 'react'
import siteConfig from '../data/siteConfig.json'
import { sanitizeInline } from '../utils/sanitizeInline'
import CategorySections from './CategorySections'
import { autoPx } from '../utils/autoPx'
import { getMaintenanceGate } from '../components/SiteMaintenance'
import { t } from '../i18n'
import { typo } from '../utils/typography'

function ExtraField({ field, value, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label className="contacts-form-checkbox">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} required={field.required} />
        <span dangerouslySetInnerHTML={{ __html: sanitizeInline(field.label || '') }} />
      </label>
    )
  }
  return (
    <div className="contacts-form-field">
      <label>{field.label}</label>
      {field.type === 'textarea'
        ? <textarea rows={4} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} required={field.required} />
        : <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} required={field.required} />}
    </div>
  )
}

function ContactForm({ endpoint, extraFields }) {
  const [values, setValues] = useState(() => ({
    name: '', email: '', subject: '', message: '',
    ...Object.fromEntries(extraFields.map(f => [f.id, f.type === 'checkbox' ? false : ''])),
  }))
  const [status, setStatus] = useState('idle') // idle | sending | sent | error

  const set = (field) => (e) => setValues(v => ({ ...v, [field]: e.target.value }))
  const setExtra = (id) => (val) => setValues(v => ({ ...v, [id]: val }))
  const extraRequiredOk = extraFields.every(f => !f.required || (f.type === 'checkbox' ? values[f.id] : String(values[f.id] || '').trim()))
  const canSubmit = values.name.trim() && values.email.trim() && values.message.trim() && extraRequiredOk && status !== 'sending'

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setStatus('sending')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('failed')
      setStatus('sent')
      setValues({ name: '', email: '', subject: '', message: '', ...Object.fromEntries(extraFields.map(f => [f.id, f.type === 'checkbox' ? false : ''])) })
    } catch {
      setStatus('error')
    }
  }

  const styleVars = {
    ...(siteConfig.contactsFormFont && siteConfig.contactsFormFont !== 'inherit' ? { '--contacts-form-font': siteConfig.contactsFormFont } : {}),
    ...(siteConfig.contactsFormLabelColor ? { '--contacts-form-label-color': siteConfig.contactsFormLabelColor } : {}),
    ...(siteConfig.contactsFormInputColor ? { '--contacts-form-input-color': siteConfig.contactsFormInputColor } : {}),
    ...(siteConfig.contactsFormLineColor ? { '--contacts-form-line-color': siteConfig.contactsFormLineColor } : {}),
    ...(siteConfig.contactsFormButtonColor ? { '--contacts-form-button-bg': siteConfig.contactsFormButtonColor } : {}),
    ...(siteConfig.contactsFormButtonTextColor ? { '--contacts-form-button-text': siteConfig.contactsFormButtonTextColor } : {}),
    ...(siteConfig.contactsFormButtonRadius ? { '--contacts-form-button-radius': `${siteConfig.contactsFormButtonRadius}px` } : {}),
  }

  if (status === 'sent') {
    return <div className="contacts-form contacts-form-done" style={styleVars}>{siteConfig.contactsFormSuccessText || t('Thanks — your message has been sent.')}</div>
  }

  return (
    <form className="contacts-form" style={styleVars} onSubmit={submit}>
      <div className="contacts-form-col">
        <div className="contacts-form-field">
          <label htmlFor="cf-name">{t('Name')}</label>
          <input id="cf-name" value={values.name} onChange={set('name')} placeholder={t('Your name')} required />
        </div>
        <div className="contacts-form-field">
          <label htmlFor="cf-email">{t('Email')}</label>
          <input id="cf-email" type="email" value={values.email} onChange={set('email')} placeholder={t('So I can reply to you')} required />
        </div>
        <div className="contacts-form-field">
          <label htmlFor="cf-subject">{t('Subject')}</label>
          <input id="cf-subject" value={values.subject} onChange={set('subject')} placeholder={t("What's this about?")} />
        </div>
      </div>
      <div className="contacts-form-col">
        <div className="contacts-form-field">
          <label htmlFor="cf-message">{t('Message')}</label>
          <textarea id="cf-message" rows={4} value={values.message} onChange={set('message')} placeholder={t('Say anything...')} required />
        </div>
        {extraFields.map(f => (
          <ExtraField key={f.id} field={f} value={values[f.id]} onChange={setExtra(f.id)} />
        ))}
        <div className="contacts-form-actions">
          {status === 'error' && <span className="contacts-form-error">{t('Something went wrong — please try again.')}</span>}
          <button type="submit" disabled={!canSubmit}>{status === 'sending' ? t('Sending…') : (siteConfig.contactsFormButtonText || t('Send message'))}</button>
        </div>
      </div>
    </form>
  )
}

export default function Contacts() {
  const maintenanceGate = getMaintenanceGate(siteConfig.contactsMaintenance)
  if (maintenanceGate) return maintenanceGate

  return (
    <div className="contacts">
      <section className="contacts-intro" style={{
        ...(siteConfig.contactsIntroTopGap ? { '--contacts-intro-top-gap': `${siteConfig.contactsIntroTopGap}px` } : {}),
        ...(siteConfig.contactsIntroTopGapMobile ? { '--contacts-intro-top-gap-mobile': `${siteConfig.contactsIntroTopGapMobile}px` } : {}),
        ...(siteConfig.contactsIntroTitleGap ? { '--contacts-intro-title-gap': `${siteConfig.contactsIntroTitleGap}px` } : {}),
        ...(siteConfig.contactsIntroTitleGapMobile ? { '--contacts-intro-title-gap-mobile': `${siteConfig.contactsIntroTitleGapMobile}px` } : {}),
      }}>
        <h1 style={{
          ...(siteConfig.contactsIntroTitleSize ? { fontSize: autoPx(siteConfig.contactsIntroTitleSize) } : {}),
          ...((siteConfig.contactsIntroTitleWeight || siteConfig.contactsIntroTitleBold) ? { fontWeight: siteConfig.contactsIntroTitleWeight || 700 } : {}),
          ...(siteConfig.contactsIntroTitleFont && siteConfig.contactsIntroTitleFont !== 'inherit' ? { fontFamily: siteConfig.contactsIntroTitleFont } : {}), ...typo(siteConfig, 'contactsIntroTitle'),
          ...(siteConfig.contactsIntroTitleColor ? { color: siteConfig.contactsIntroTitleColor } : {}),
        }}>{siteConfig.contactsIntroTitle || t('Contact')}</h1>
        <p style={{
          ...(siteConfig.contactsIntroDescSize ? { fontSize: autoPx(siteConfig.contactsIntroDescSize) } : {}),
          ...((siteConfig.contactsIntroDescWeight || siteConfig.contactsIntroDescBold) ? { fontWeight: siteConfig.contactsIntroDescWeight || 700 } : {}),
          ...(siteConfig.contactsIntroDescFont && siteConfig.contactsIntroDescFont !== 'inherit' ? { fontFamily: siteConfig.contactsIntroDescFont } : {}), ...typo(siteConfig, 'contactsIntroDesc'),
          ...(siteConfig.contactsIntroDescColor ? { color: siteConfig.contactsIntroDescColor } : {}),
        }} dangerouslySetInnerHTML={{ __html: sanitizeInline(siteConfig.contactsIntroDescription || '') }} />
      </section>

      {(siteConfig.contactsSections || []).length > 0 && (
        <CategorySections sections={siteConfig.contactsSections} basePath="/assets/contacts/sections" tabletImageMode={siteConfig.contactsTabletImageMode} />
      )}

      {siteConfig.contactsFormEnabled !== false && siteConfig.contactsFormEndpoint && (
        <ContactForm endpoint={siteConfig.contactsFormEndpoint} extraFields={siteConfig.contactsFormFields || []} />
      )}
    </div>
  )
}
