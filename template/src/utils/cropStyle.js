export const cropStyle = (crop) => {
  if (!crop) return {}
  // New format: { x1, y1, x2, y2 } — true crop by absolute region
  if (crop.x1 !== undefined) {
    const { x1, y1, x2, y2 } = crop
    const cropW = x2 - x1
    const cropH = y2 - y1
    return {
      position: 'absolute',
      width: `${10000 / cropW}%`,
      height: `${10000 / cropH}%`,
      left: `${-x1 * 100 / cropW}%`,
      top: `${-y1 * 100 / cropH}%`,
      right: 'auto',
      bottom: 'auto',
      objectFit: 'unset',
      borderRadius: 0,
    }
  }
  // Legacy format: { x, y, scale }
  const x = crop.x ?? 50
  const y = crop.y ?? 50
  const s = crop.scale ?? 1
  return {
    objectPosition: `${x}% ${y}%`,
    ...(s !== 1 ? { transform: `scale(${s})`, transformOrigin: `${x}% ${y}%` } : {}),
  }
}
