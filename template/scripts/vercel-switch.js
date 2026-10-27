#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PROFILES_DIR = path.join(ROOT, '.vercel', 'profiles')
const TOKENS_DIR = path.join(ROOT, '.vercel', 'tokens')
const PROJECT_JSON = path.join(ROOT, '.vercel', 'project.json')
const ACTIVE_FILE = path.join(ROOT, '.vercel', 'active')

const profiles = fs.readdirSync(PROFILES_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''))

if (profiles.length === 0) {
  console.log('No profiles found in .vercel/profiles/')
  process.exit(1)
}

let current = ''
try { current = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim() } catch {}

console.log('\n  Vercel Profile Switcher\n')
profiles.forEach((p, i) => {
  const active = p === current ? ' ◀ active' : ''
  console.log(`  [${i + 1}] ${p}${active}`)
})
console.log()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('  Select profile (number): ', (answer) => {
  rl.close()
  const idx = parseInt(answer) - 1
  if (isNaN(idx) || idx < 0 || idx >= profiles.length) {
    console.log('  Invalid selection.\n')
    process.exit(1)
  }

  const name = profiles[idx]

  fs.copyFileSync(path.join(PROFILES_DIR, `${name}.json`), PROJECT_JSON)

  const tokenFile = path.join(TOKENS_DIR, name)
  let tokenNote = ''
  if (fs.existsSync(tokenFile)) {
    fs.copyFileSync(tokenFile, path.join(TOKENS_DIR, 'active'))
    tokenNote = ' + token applied'
  } else {
    tokenNote = ' (no token — add it to .vercel/tokens/' + name + ')'
  }

  fs.writeFileSync(ACTIVE_FILE, name)
  console.log(`\n  Switched to: ${name}${tokenNote}\n`)
})
