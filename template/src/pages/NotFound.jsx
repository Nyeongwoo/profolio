import { Link } from 'react-router-dom'
import siteConfig from '../data/siteConfig.json'
import { ImageWithFallback } from '../utils/getImage'
import { t } from '../i18n'
import { sanitizeInline } from '../utils/sanitizeInline'
import { typo } from '../utils/typography'

export default function NotFound() {
  const title = siteConfig.notFoundTitle || t('Page Not Found')
  const desc  = siteConfig.notFoundDesc  || t("The page you're looking for doesn't exist or the link may be broken.")
  const imageBase = (siteConfig.notFoundImage || '/maintenance').replace(/\.(gif|webp|png|jpg|jpeg|svg)$/i, '')

  return (
    <div
      style={{
        minHeight: '70vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#fff', fontFamily: 'inherit',
        gap: '20px', padding: '80px 20px',
      }}
    >
      <ImageWithFallback
        basePath={imageBase}
        alt=""
        style={{ width: '80px', height: '80px', objectFit: 'contain' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '28px', fontWeight: 700, color: '#111', letterSpacing: '-0.02em', ...typo(siteConfig, 'notFoundTitle') }}>
          {title}
        </div>
        <div style={{ fontSize: '15px', color: 'rgba(0,0,0,0.55)', maxWidth: '340px', lineHeight: 1.8, textAlign: 'center', fontWeight: 400, ...typo(siteConfig, 'notFoundDesc') }} dangerouslySetInnerHTML={{ __html: sanitizeInline(desc) }} />
      </div>

      <Link
        to="/"
        style={{
          marginTop: '4px', fontSize: '13px', color: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(0,0,0,0.25)', borderRadius: '999px',
          padding: '8px 20px', textDecoration: 'none', transition: 'color 0.15s, border-color 0.15s',
        }}
      >
        Back to Home
      </Link>
    </div>
  )
}
