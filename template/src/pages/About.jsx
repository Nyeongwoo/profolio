import { ImageWithFallback } from '../utils/getImage'
import siteConfig from '../data/siteConfig.json'
import aboutData from '../data/about.json'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsMobile, useBreakpointTier } from '../utils/useIsMobile'
import CategorySections from './CategorySections'
import { sanitizeInline } from '../utils/sanitizeInline'
import { autoPx } from '../utils/autoPx'
import { getMaintenanceGate } from '../components/SiteMaintenance'
import { t } from '../i18n'
import { typo } from '../utils/typography'
import { liveLink, switchOffLinks } from '../utils/linkSwitch'

const PHOTO_EXTS = ['webp', 'png', 'jpg', 'jpeg']
const resolveByTier = (obj, key, tier) => {
  if (tier === 'mobile' && obj[`${key}Mobile`] != null) return obj[`${key}Mobile`]
  if (tier === 'mobile' && obj[`${key}Tablet`] != null) return obj[`${key}Tablet`]
  if (tier === 'tablet' && obj[`${key}Tablet`] != null) return obj[`${key}Tablet`]
  return obj[key]
}

const goToPhotoLink = (navigate, link) => {
  if (!link) return
  if (/^https?:\/\//.test(link)) window.open(link, '_blank', 'noopener,noreferrer')
  else if (/^(mailto|tel):/.test(link)) window.location.href = link
  else navigate(link)
}

export default function About() {
  const navigate = useNavigate()
  // About ▸ Page ▸ "Disable every link" turns off the sections' and photos' links.
  const linksOff = aboutData.linksDisabled === true
  const sections = switchOffLinks(aboutData.sections, linksOff)
  const photos = switchOffLinks((aboutData.photos.items || []).filter(p => !p.hidden), linksOff)
  const infinitePhotos = photos.length > 0 ? [...photos, ...photos, ...photos] : photos
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const profileRatio = isMobile ? (aboutData.intro.profileMobileRatio || '1/1') : (aboutData.intro.profileDesktopRatio || '1/1')
  const profileImg = tier !== 'desktop' && aboutData.intro.profileMobileImage ? aboutData.intro.profileMobileImage : (aboutData.intro.profileImage || '/assets/about/profile')
  const [current, setCurrent] = useState(photos.length)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const dragStartX = useRef(null)
  const isDragging = useRef(false)
  const trackRef = useRef(null)
  const wrapRef = useRef(null)
  const [slideStep, setSlideStep] = useState(0)
  const [slideSize, setSlideSize] = useState(0)

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current
      if (!track || !track.firstElementChild) return
      const rect = track.firstElementChild.getBoundingClientRect()
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0')
      setSlideStep(rect.width + gap)
      setSlideSize(rect.width)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [photos.length])

  useEffect(() => {
    if (photos.length === 0) return
    if (current >= photos.length * 2) {
      const t = setTimeout(() => { setIsTransitioning(false); setCurrent(photos.length) }, 400)
      return () => clearTimeout(t)
    }
    if (current < photos.length) {
      const t = setTimeout(() => { setIsTransitioning(false); setCurrent(photos.length * 2 - 1) }, 400)
      return () => clearTimeout(t)
    }
  }, [current, photos.length])

  const advance = () => { setCurrent(prev => prev + 1); setIsTransitioning(true) }

  const restartAutoplayRef = useRef(() => {})
  useEffect(() => {
    if (photos.length <= 1) return
    let id
    restartAutoplayRef.current = () => {
      clearInterval(id)
      id = setInterval(advance, 5000)
    }
    restartAutoplayRef.current()
    return () => clearInterval(id)
  }, [photos.length])

  const handleDragStart = (e) => {
    dragStartX.current = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX
    isDragging.current = true
  }

  const handleDragEnd = (e) => {
    if (!isDragging.current) return
    const endX = e.type === 'touchend' ? e.changedTouches[0].clientX : e.clientX
    const diff = dragStartX.current - endX
    if (diff > 50) { setCurrent(prev => prev + 1); setIsTransitioning(true); restartAutoplayRef.current() }
    if (diff < -50) { setCurrent(prev => prev - 1); setIsTransitioning(true); restartAutoplayRef.current() }
    isDragging.current = false
  }

  const maintenanceGate = getMaintenanceGate(aboutData.maintenance)
  if (maintenanceGate) return maintenanceGate

  return (
    <div className="about">
      <section className={`about-intro${aboutData.intro.alignPhotoBottom ? ' about-intro--photo-align' : ''}`} style={{
        ...(aboutData.intro.topGap ? { '--about-intro-top-gap': autoPx(aboutData.intro.topGap) } : {}),
        ...(aboutData.intro.topGapMobile ? { '--about-intro-top-gap-mobile': autoPx(aboutData.intro.topGapMobile) } : {}),
        ...(aboutData.intro.titleGap ? { '--about-intro-title-gap': autoPx(aboutData.intro.titleGap) } : {}),
        ...(aboutData.intro.titleGapMobile ? { '--about-intro-title-gap-mobile': autoPx(aboutData.intro.titleGapMobile) } : {}),
        ...(aboutData.intro.profileSizeTablet ? { '--about-profile-size-tablet': autoPx(aboutData.intro.profileSizeTablet) } : {}),
        ...(aboutData.intro.profileSizeDesktop ? { '--about-profile-size-desktop': autoPx(aboutData.intro.profileSizeDesktop) } : {}),
      }}>
        <div className="about-intro-text">
          <h1 style={{
            ...(resolveByTier(aboutData.intro, 'titleSize', tier) ? {fontSize: autoPx(resolveByTier(aboutData.intro, 'titleSize', tier))} : {}),
            ...((aboutData.intro.titleWeight || aboutData.intro.titleBold) ? {fontWeight: aboutData.intro.titleWeight || 700} : {}),
            ...(aboutData.intro.titleFont && aboutData.intro.titleFont !== 'inherit' ? {fontFamily: aboutData.intro.titleFont} : {}), ...typo(aboutData.intro, 'title'),
            ...(aboutData.intro.titleColor ? {color: aboutData.intro.titleColor} : {}),
          }}>{aboutData.intro.title}</h1>
          <p style={{
            ...(resolveByTier(aboutData.intro, 'descSize', tier) ? {fontSize: autoPx(resolveByTier(aboutData.intro, 'descSize', tier))} : {}),
            ...((aboutData.intro.descWeight || aboutData.intro.descBold) ? {fontWeight: aboutData.intro.descWeight || 700} : {}),
            ...(aboutData.intro.descFont && aboutData.intro.descFont !== 'inherit' ? {fontFamily: aboutData.intro.descFont} : {}), ...typo(aboutData.intro, 'desc'),
            ...(aboutData.intro.descColor ? {color: aboutData.intro.descColor} : {}),
          }} dangerouslySetInnerHTML={{__html: sanitizeInline(aboutData.intro.description || '')}} />
        </div>
        {aboutData.intro.hideProfile !== true && (
          <div className="about-intro-image">
            <ImageWithFallback basePath={profileImg} alt="profile" style={{aspectRatio: profileRatio, objectFit:'cover', borderRadius:'12px'}} />
          </div>
        )}
      </section>

      {sections.length > 0 && (
        <CategorySections sections={sections} basePath="/assets/about/sections" tabletImageMode={aboutData.tabletImageMode} />
      )}

      {/* Only with photos to show (an organization's About may have none). */}
      {(aboutData.photos?.items || []).length > 0 && (
        <section className="about-photos">
          <h2 style={{
            ...(aboutData.photos.headingSize ? {fontSize: autoPx(aboutData.photos.headingSize)} : {}),
            ...(aboutData.photos.headingWeight ? {fontWeight: aboutData.photos.headingWeight} : {}),
            ...(aboutData.photos.headingColor ? {color: aboutData.photos.headingColor} : {}),
            ...(aboutData.photos.headingFont && aboutData.photos.headingFont !== 'inherit' ? {fontFamily: aboutData.photos.headingFont} : {}), ...typo(aboutData.photos, 'heading'),
            ...(resolveByTier(aboutData.photos, 'headingGap', tier) != null ? {marginBottom: autoPx(resolveByTier(aboutData.photos, 'headingGap', tier))} : {}),
          }}>{aboutData.photos.heading || t('Photos')}</h2>
          <div
            ref={wrapRef}
            className="about-photos-carousel"
            onMouseDown={handleDragStart}
            onMouseUp={handleDragEnd}
            onTouchStart={handleDragStart}
            onTouchEnd={handleDragEnd}
          >
            <div
              ref={trackRef}
              className="about-photos-track"
              style={{transform: `translateX(${-current * slideStep}px)`, transition: isTransitioning ? 'transform 0.4s ease' : 'none'}}
            >
              {infinitePhotos.map((photo, idx) => (
                <div key={idx} className="about-photos-slide" style={{...(slideSize ? {height: `${slideSize}px`} : {}), ...(liveLink(photo) ? {cursor: 'pointer'} : {})}} onClick={() => goToPhotoLink(navigate, liveLink(photo))}>
                  <ImageWithFallback basePath={`/assets/about/photos/${photo.file}`} alt={photo.title || photo.file} style={{width:'100%', height:'100%', objectFit:'cover'}} extensions={PHOTO_EXTS} />
                  {(photo.title || photo.year || photo.description) && (
                    <div className="about-photos-overlay">
                      {photo.title && <p className="about-photos-overlay-title">{photo.title}</p>}
                      {photo.year && <p className="about-photos-overlay-year">{photo.year}</p>}
                      {photo.description && <p className="about-photos-overlay-desc">{photo.description}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {siteConfig.cvFile && (
        <div className="about-cv">
          <a href={siteConfig.cvFile} download className="btn-cv" style={{
            ...(siteConfig.cvButtonSize ? {fontSize: autoPx(siteConfig.cvButtonSize)} : {}),
            ...(siteConfig.cvButtonWeight ? {fontWeight: siteConfig.cvButtonWeight} : {}),
            ...(siteConfig.cvButtonColor ? {color: siteConfig.cvButtonColor} : {}),
          }}>{siteConfig.cvButtonText || t('Download CV')}</a>
        </div>
      )}
    </div>
  )
}
