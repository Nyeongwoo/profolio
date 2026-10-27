// The server only uses os.homedir() for Vercel CLI profile paths, which
// don't exist inside a package.
export const homedir = () => '/home'
export const tmpdir = () => '/tmp'
export default { homedir, tmpdir }
