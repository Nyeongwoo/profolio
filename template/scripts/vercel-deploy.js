#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const TOKENS_DIR = path.join(ROOT, '.vercel', 'tokens')
const ACTIVE_FILE = path.join(ROOT, '.vercel', 'active')

const isProd = process.argv.includes('--prod')
const env = { ...process.env }

const activeTokenFile = path.join(TOKENS_DIR, 'active')
if (fs.existsSync(activeTokenFile)) {
  env.VERCEL_TOKEN = fs.readFileSync(activeTokenFile, 'utf-8').trim()
}

let active = ''
try { active = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim() } catch {}
console.log(`\n  Deploying as: ${active || '(no profile set)'}${isProd ? ' → production' : ' → preview'}\n`)

execSync(isProd ? 'vercel --prod' : 'vercel', { stdio: 'inherit', env })
