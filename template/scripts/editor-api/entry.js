// Bundle entry for the editor API inside the Mac app (built by
// scripts/siteproj.js into a package's editor/api/server.js).
//
// The app provides `host` (package file access, log, timers, fetch) and
// calls handleRequest(method, url, headersJSON, body, done) per /api
// request; done(status, headersJSON, body) is called once it's answered.
import './globals.js'
import { app } from './express.js'
import '../../server/index.js'

globalThis.handleRequest = (method, url, headersJSON, body, done) => {
  let headers = {}
  try { headers = JSON.parse(headersJSON || '{}') } catch {}
  app.handle({ method, url, headers, body: body || '' })
    .then(r => done(r.status, JSON.stringify(r.headers), r.body))
}
