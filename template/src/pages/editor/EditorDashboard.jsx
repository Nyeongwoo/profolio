import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from './EditorComponents'

const CATEGORY_BADGE = {
  'product':     { color: '#e6f4ea', text: '#1e8e3e' },
  'mobility':    { color: '#e8f0fe', text: '#1a73e8' },
  'service':     { color: '#fce8b2', text: '#f29900' },
  'ip':          { color: '#f3e8fd', text: '#9334e6' },
  'apps':        { color: '#e0f7fa', text: '#00838f' },
  'games':       { color: '#fff3e0', text: '#e65100' },
}

function timeAgo(ms) {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function EditorDashboard() {
  const [recent, setRecent] = useState([])
  const [gitInfo, setGitInfo] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const load = () => {
      fetch(`${API}/recent-sections?limit=12`).then(r => r.json()).then(setRecent).catch(() => {})
      fetch(`${API}/git-info`).then(r => r.json()).then(setGitInfo).catch(() => {})
    }
    load()
    window.addEventListener('server-online', load)
    return () => window.removeEventListener('server-online', load)
  }, [])

  const card = {
    background: 'var(--ed-card-bg)',
    border: '1px solid var(--ed-card-border)',
    borderRadius: '10px',
    padding: '14px 16px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: '860px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--ed-text)' }}>Dashboard</h1>
        {gitInfo && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ed-text-muted)', display: 'flex', gap: '16px' }}>
            <span>Last commit: <span style={{ color: 'var(--ed-text-sub)' }}>{gitInfo.lastCommit?.message || '—'}</span></span>
            {gitInfo.lastDeploy && <span>Deployed: <span style={{ color: 'var(--ed-text-sub)' }}>{new Date(gitInfo.lastDeploy).toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ed-text-muted)', textTransform: 'uppercase' }}>
        Recently Modified
      </div>

      {recent.length === 0 ? (
        <div style={{ color: 'var(--ed-text-muted)', fontSize: '13px', padding: '20px 0' }}>No projects found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
          {recent.map(item => {
            const badge = CATEGORY_BADGE[item.category] || { color: '#f0f0f0', text: '#555' }
            return (
              <button
                key={`${item.category}/${item.id}`}
                style={card}
                onClick={() => navigate(`/editor/projects/${item.category}/${item.id}`)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ed-accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ed-card-border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                    background: badge.color, color: badge.text, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                  }}>{item.category}</span>
                  <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)', marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(item.mtime)}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)', textAlign: 'left', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', textAlign: 'left' }}>{item.id}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
