// promisify for the child_process shim's callback style; like Node's
// promisify(exec), it resolves { stdout, stderr }.
export const promisify = (fn) => (...args) => new Promise((resolve, reject) =>
  fn(...args, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr }))))
export default { promisify }
