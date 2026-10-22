export const fileURLToPath = (u) => decodeURIComponent(String(u).replace(/^file:\/\//, ''))
export default { fileURLToPath }
