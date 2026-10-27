// Accepts a full YouTube URL (youtube.com/watch?v=, youtu.be/, /embed/, /shorts/)
// or a bare 11-character video ID, and returns just the ID — so the editor
// field and the stored data both just deal in IDs regardless of what the
// author pasted in.
export function extractYoutubeId(input) {
  if (!input) return ''
  const trimmed = input.trim()
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = trimmed.match(re)
    if (m) return m[1]
  }
  // Not a recognizable URL — assume it's already a bare video ID (or the
  // user is still mid-typing one) and pass it through as-is.
  return trimmed
}
