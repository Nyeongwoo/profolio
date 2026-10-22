// No processes inside the app: git/vercel steps (deploy, git-info, Vercel
// profiles) fail and the routes report it. Publishing is done by the app.
const unavailable = (cmd) => Object.assign(new Error(`"${cmd}" is not available in the app`), { code: 'ENOSYS' })
const lastCallback = (args) => [...args].reverse().find(a => typeof a === 'function')

export function exec(cmd, ...args) {
  const cb = lastCallback(args)
  setTimeout(() => cb && cb(unavailable(cmd), '', ''), 0)
}
export function execFile(file, ...args) {
  const cb = lastCallback(args)
  setTimeout(() => cb && cb(unavailable(file), '', ''), 0)
}
export function spawn(cmd) { throw unavailable(cmd) }
export default { exec, execFile, spawn }
