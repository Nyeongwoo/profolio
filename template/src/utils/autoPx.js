// A bare number typed into a size field (e.g. "36") is treated as px —
// only appends the unit when the value is a plain number, leaving strings
// that already carry a unit (e.g. "36px", "2rem", "120%") untouched.
export const autoPx = v => v != null && v !== '' && /^\d+(\.\d+)?$/.test(String(v)) ? `${v}px` : v
