import { Link } from 'react-router-dom'
import blogPosts from '../data/blog.json'
import { ImageWithFallback, PLACEHOLDER_IMG } from '../utils/getImage'
import { sanitizeInline } from '../utils/sanitizeInline'
import { minimalAllows } from '../utils/minimal'
import { t } from '../i18n'

// Sections an organization's site needs (any page can use them):
//
//   people:        { people: [{ name, role, affiliation, bio, link, photo, featured }],
//                    featuredLabel?, columns? }    — a directory of people
//   recent-posts:  { count?, category?, showDate? } — the newest Blog posts
//
// A person's photo is a file in the page's section folder (basePath), or
// "__placeholder__".

const photoSrc = (basePath, photo) => !photo || photo === PLACEHOLDER_IMG ? PLACEHOLDER_IMG
  : photo.startsWith('/') ? photo.replace(/\.[a-z0-9]+$/i, '') : `${basePath}/${photo.replace(/\.[a-z0-9]+$/i, '')}`

function PersonCard({ person, basePath, badge }) {
  const inner = (
    <>
      <div className="org-person-photo">
        <ImageWithFallback basePath={photoSrc(basePath, person.photo)} alt={person.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div className="org-person-text">
        {badge && <span className="org-person-badge">{badge}</span>}
        {person.name && <p className="org-person-name" dangerouslySetInnerHTML={{ __html: sanitizeInline(person.name) }} />}
        {person.role && <p className="org-person-role" dangerouslySetInnerHTML={{ __html: sanitizeInline(person.role) }} />}
        {person.affiliation && <p className="org-person-affiliation" dangerouslySetInnerHTML={{ __html: sanitizeInline(person.affiliation) }} />}
        {person.bio && <p className="org-person-bio" dangerouslySetInnerHTML={{ __html: sanitizeInline(person.bio) }} />}
      </div>
    </>
  )
  if (!person.link) return <div className="org-person">{inner}</div>
  return /^https?:\/\//.test(person.link)
    ? <a className="org-person org-person--link" href={person.link} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <Link className="org-person org-person--link" to={person.link}>{inner}</Link>
}

export function PeopleSection({ section, basePath }) {
  const people = (section.people || []).filter(p => !p.hidden)
  const featured = people.filter(p => p.featured)
  const rest = people.filter(p => !p.featured)
  const columns = Number(section.columns) || 4
  return (
    <div className="org-people">
      {featured.length > 0 && (
        <div className="org-people-featured">
          {featured.map((p, i) => <PersonCard key={`f${i}`} person={p} basePath={basePath} badge={section.featuredLabel || t('Featured')} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="org-people-grid" style={{ '--org-columns': columns }}>
          {rest.map((p, i) => <PersonCard key={i} person={p} basePath={basePath} />)}
        </div>
      )}
    </div>
  )
}

export function RecentPostsSection({ section }) {
  if (!minimalAllows('/blog')) return null
  const count = Number(section.count) || 4
  const posts = blogPosts
    .filter(p => p && p.id && !p.hidden && (!section.category || p.category === section.category))
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, count)
  if (posts.length === 0) return null
  return (
    <ul className="org-recent-posts">
      {posts.map(p => (
        <li key={p.id}>
          <Link to={`/blog/post/${p.id}`} className="org-recent-post">
            <span className="org-recent-post-title" dangerouslySetInnerHTML={{ __html: sanitizeInline(p.title || p.id) }} />
            {section.showDate !== false && p.date && <span className="org-recent-post-date">{String(p.date).replace(/\//g, '.')}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
