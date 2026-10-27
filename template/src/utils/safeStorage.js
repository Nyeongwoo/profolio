// localStorage.getItem/setItem throw a SecurityError in Safari when the user
// has "Block all cookies" on (or in some Private Browsing configurations) —
// unlike Chrome, which just silently no-ops. The editor calls localStorage
// directly in a lot of useState initializers (remembered zoom, collapsed
// sections, theme, ...), so one blocked call during first render was enough
// to throw before anything painted, taking down the whole editor shell with
// a blank page and no console error. These wrappers swallow that and fall
// back to behaving like an empty store instead.
export function safeGet(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable — the setting just won't persist this session.
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage unavailable — nothing to remove.
  }
}
