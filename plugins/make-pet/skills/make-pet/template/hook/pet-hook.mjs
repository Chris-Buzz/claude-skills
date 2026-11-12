// Records what one Claude Code session is doing, for the __PET_NAME__ desktop pet.
//
// Claude Code runs this from command hooks in ~/.claude/settings.json. It passes the hook's
// event as JSON on stdin; the hook command passes __PET_NAME__'s state as the first argument:
// hello, working, needs-you, done, blocked or end. The script writes
// ~/.claude/__PET_SLUG__-pet/sessions/<session_id>.json, which the app reads twice a second, and
// prints nothing. The hook commands also send stdout to /dev/null, so nothing from here can
// reach Claude's context or answer a permission prompt.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Taken before anything else, so an async run that finishes late still carries the time
// its event fired.
const at = Date.now()
const state = process.argv[2]
const STATES = new Set(['hello', 'working', 'needs-you', 'done', 'blocked', 'end'])

// A byte-order mark can lead the input when it comes through a PowerShell pipe.
const event = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿/, ''))
const id = event.session_id
if (!STATES.has(state) || typeof id !== 'string' || !/^[\w-]+$/.test(id)) process.exit(0)

const dir = join(homedir(), '.claude', '__PET_SLUG__-pet', 'sessions')
const file = join(dir, `${id}.json`)

if (state === 'end') {
  rmSync(file, { force: true })
  process.exit(0)
}

mkdirSync(dir, { recursive: true })
let previous = null
try {
  previous = JSON.parse(readFileSync(file, 'utf8'))
} catch {
  // First event for this session, or a file from an older format: start fresh.
}
// A newer event already wrote this session's file (an async hook can finish late).
if (previous && previous.at > at) process.exit(0)

const record = {
  state,
  at,
  started: previous?.started ?? at,
  cwd: event.cwd ?? previous?.cwd ?? null,
  transcript: event.transcript_path ?? previous?.transcript ?? null,
  // What Claude is waiting on (a tool name) or why the turn failed (an API error type).
  detail: event.tool_name ?? event.error ?? null,
}

// Write a temp file and rename it over the old one, so the app never reads half a file.
const temp = `${file}.${process.pid}.tmp`
writeFileSync(temp, JSON.stringify(record))
try {
  renameSync(temp, file)
} catch {
  // Windows refuses the rename while the app has the file open; write in place instead.
  writeFileSync(file, JSON.stringify(record))
  rmSync(temp, { force: true })
}
