import { useState } from 'react'
import siteConfig from '../data/siteConfig.json'
import { t } from '../i18n'
import { sanitizeInline } from '../utils/sanitizeInline'
import { typo } from '../utils/typography'

// Shared by both the site-wide gate (App.jsx) and any per-page gate (see
// usePageMaintenanceGate below) — unlocking once (via the secret triple-click
// + password) clears the gate everywhere for the rest of the browser session,
// rather than making an editor re-enter the password per page.
export const MAINTENANCE_SESSION_KEY = 'maintenanceUnlocked'

export function SiteMaintenance() {
  const [clicks, setClicks]       = useState(0)
  const [showInput, setShowInput] = useState(false)
  const [input, setInput]         = useState('')
  const [error, setError]         = useState(false)
  const [shake, setShake]         = useState(false)

  const password = siteConfig.maintenancePassword || '0310'
  const title    = siteConfig.maintenanceTitle    || t('Under Maintenance')
  const desc     = siteConfig.maintenanceDesc     || "We're updating our site to bring you an even better experience. We'll be back shortly."
  const image    = siteConfig.maintenanceImage    || '/maintenance.png'

  const handlePageClick = () => {
    if (showInput) return
    const next = clicks + 1
    setClicks(next)
    if (next >= 3) setShowInput(true)
  }

  const submit = (e) => {
    e.preventDefault()
    if (input === password) {
      sessionStorage.setItem(MAINTENANCE_SESSION_KEY, 'true')
      window.location.reload()
    } else {
      setError(true)
      setShake(true)
      setInput('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div
      onClick={handlePageClick}
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#000', fontFamily: 'inherit',
        gap: '20px', userSelect: 'none', zIndex: 9999,
      }}
    >
      <img
        src={image}
        alt=""
        style={{ width: '80px', height: '80px', objectFit: 'contain' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '28px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', ...typo(siteConfig, 'maintenanceTitle') }}>
          {title}
        </div>
        <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)', maxWidth: '340px', lineHeight: 1.8, textAlign: 'center', fontWeight: 400, ...typo(siteConfig, 'maintenanceDesc') }} dangerouslySetInnerHTML={{ __html: sanitizeInline(desc) }} />
      </div>

      {showInput && (
        <form
          onSubmit={submit}
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '4px' }}
        >
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            autoFocus
            placeholder="・・・・"
            style={{
              border: 'none',
              borderBottom: error ? '1.5px solid #e53e3e' : '1.5px solid rgba(255,255,255,0.3)',
              outline: 'none',
              fontSize: '20px',
              letterSpacing: '0.3em',
              textAlign: 'center',
              padding: '6px 12px',
              width: '120px',
              background: 'transparent',
              fontFamily: 'inherit',
              color: '#fff',
              animation: shake ? 'siteShake 0.4s ease' : 'none',
              transition: 'border-color 0.15s',
            }}
          />
          {error && (
            <div style={{ fontSize: '11px', color: '#e53e3e' }}>{t('Incorrect password')}</div>
          )}
        </form>
      )}

      <style>{`
        @keyframes siteShake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}

// Per-page maintenance check (project/original/blog-post/static-page level),
// separate from siteConfig's site-wide `maintenance` flag (checked directly
// in App.jsx since it gates routing itself, before any page component
// mounts). `active` is that page's own stored flag (e.g. info.maintenance).
// Same DEV bypass and session-unlock as the site-wide gate, so an editor
// working locally never gets locked out of their own in-progress page.
//
// Not a real hook (calls no hooks itself) despite the temptation to name it
// that way — deliberately, so callers can check it after an early return
// (e.g. a "not found" guard) without tripping the rules-of-hooks lint rule.
export function getMaintenanceGate(active) {
  if (!active || import.meta.env.DEV) return null
  if (sessionStorage.getItem(MAINTENANCE_SESSION_KEY) === 'true') return null
  return <SiteMaintenance />
}
