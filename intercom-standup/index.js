#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║            INTERCOM-STANDUP  v1.0.0                          ║
 * ║   Decentralized P2P Daily Standup Bot                        ║
 * ║   Intercom Vibe Competition — Trac Systems                   ║
 * ║   Trac Address: [INSERT_YOUR_TRAC_ADDRESS_HERE]              ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Features:
 *   • Guided 3-question standup (Yesterday / Today / Blockers)
 *   • Auto-scheduled broadcast via cron (default: 09:00 daily)
 *   • Daily recap: collects all peer standups into one summary
 *   • Reminder ping to peers who haven't submitted yet
 *   • Persist today's standups to standups.json (lightweight, no DB)
 *
 * Modes:
 *   node index.js                    → interactive (fill + listen)
 *   node index.js --mode=standup     → fill standup now & broadcast
 *   node index.js --mode=listen      → receive standups only
 *   node index.js --mode=recap       → print today's recap & exit
 *   node index.js --schedule=09:00   → set auto-broadcast time (HH:MM)
 *   node index.js --topic=myteam     → custom P2P channel
 *   node index.js --name=Alice       → set your display name
 */

'use strict'

const Hyperswarm      = require('hyperswarm')
const crypto          = require('crypto')
const b4a             = require('b4a')
const readline        = require('readline')
const fs              = require('fs')
const path            = require('path')
const argv            = require('minimist')(process.argv.slice(2))
const cron            = require('node-cron')

// ── Chalk v4 (CommonJS) ───────────────────────────────────────────────────────
let chalk
try {
  chalk = require('chalk')
} catch {
  const id = s => s
  chalk = { cyan: id, green: id, yellow: id, red: id, gray: id, magenta: id,
    white: id, blue: id, bold: { cyan: id, yellow: id, green: id, white: id, red: id } }
}

// ── Config ────────────────────────────────────────────────────────────────────
const CHANNEL      = argv.topic    || 'intercom-standup-v1'
const MODE         = argv.mode     || 'interactive'
const SCHEDULE     = argv.schedule || '09:00'
const MY_NAME      = argv.name     || `peer-${crypto.randomBytes(2).toString('hex')}`
const TRAC_ADDR    = '[INSERT_YOUR_TRAC_ADDRESS_HERE]'
const VERSION      = '1.0.0'
const DATA_FILE    = path.join(__dirname, 'standups.json')
const REMINDER_MS  = 30 * 60 * 1000   // remind after 30 min if no standup received

// ── Standup questions ─────────────────────────────────────────────────────────
const QUESTIONS = [
  { key: 'yesterday', prompt: '📅  What did you do YESTERDAY?' },
  { key: 'today',     prompt: '🎯  What will you do TODAY?' },
  { key: 'blockers',  prompt: '🚧  Any BLOCKERS or issues?' }
]

// ── Persistence helpers (standups.json) ───────────────────────────────────────
function todayKey () {
  return new Date().toISOString().slice(0, 10)   // "2025-07-04"
}

function loadData () {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    }
  } catch { /* corrupt file — start fresh */ }
  return {}
}

function saveData (data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error(chalk.red('  ⚠ Could not save standups.json: ' + err.message))
  }
}

function saveStandup (name, entry) {
  const data = loadData()
  const key  = todayKey()
  if (!data[key]) data[key] = {}
  data[key][name] = { ...entry, savedAt: new Date().toISOString() }
  saveData(data)
}

function getTodayStandups () {
  const data = loadData()
  return data[todayKey()] || {}
}

function hasMineToday () {
  const today = getTodayStandups()
  return !!today[MY_NAME]
}

// ── Message types ─────────────────────────────────────────────────────────────
const MSG = {
  STANDUP:  'standup',   // full standup entry
  REMINDER: 'reminder',  // nudge peers who haven't submitted
  RECAP_REQ:'recap_req', // request recap from peers
  RECAP:    'recap',     // full recap payload
  PING:     'ping'
}

function makeMsg (type, payload = {}) {
  return JSON.stringify({
    v:    VERSION,
    type,
    from: MY_NAME,
    ts:   Date.now(),
    ...payload
  })
}

function parseMsg (raw) {
  try { return JSON.parse(raw.toString('utf8')) } catch { return null }
}

// ── Display helpers ───────────────────────────────────────────────────────────
function banner () {
  console.log()
  console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════════╗'))
  console.log(chalk.cyan('║') + chalk.bold.cyan('   INTERCOM-STANDUP  v' + VERSION + '                                ') + chalk.cyan('║'))
  console.log(chalk.cyan('║') + '   Decentralized P2P Daily Standup Bot                        ' + chalk.cyan('║'))
  console.log(chalk.cyan('║') + chalk.bold.yellow('   Intercom Vibe Competition — Trac Systems                   ') + chalk.cyan('║'))
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════════╝'))
  console.log()
}

function printConfig () {
  console.log(chalk.bold.cyan('  Channel  : ') + CHANNEL)
  console.log(chalk.bold.cyan('  Name     : ') + MY_NAME)
  console.log(chalk.bold.cyan('  Mode     : ') + MODE)
  console.log(chalk.bold.cyan('  Schedule : ') + SCHEDULE + ' daily')
  console.log(chalk.bold.cyan('  Trac     : ') + TRAC_ADDR)
  console.log()
}

function printHelp () {
  console.log(chalk.bold.yellow('  Commands:'))
  console.log('  ' + chalk.green('/standup') + '        — fill & broadcast your standup now')
  console.log('  ' + chalk.green('/recap') + '          — show today\'s collected standups')
  console.log('  ' + chalk.green('/reminder') + '       — ping peers who haven\'t submitted yet')
  console.log('  ' + chalk.green('/peers') + '          — show connected peer count')
  console.log('  ' + chalk.green('/help') + '           — show this help')
  console.log('  ' + chalk.green('/quit') + '           — exit gracefully')
  console.log()
}

function printRecap (standups, fromNetwork = false) {
  const names = Object.keys(standups)
  const source = fromNetwork ? chalk.gray(' (from network)') : ''

  console.log()
  console.log(chalk.bold.yellow(`  ╔══ DAILY RECAP — ${todayKey()} ══╗`) + source)

  if (names.length === 0) {
    console.log(chalk.gray('  No standups collected yet today.'))
    console.log()
    return
  }

  for (const name of names) {
    const s = standups[name]
    console.log()
    console.log(chalk.bold.cyan(`  👤 ${name}`))
    console.log(chalk.gray('  ─────────────────────────────────'))
    console.log(chalk.yellow('  📅 Yesterday : ') + chalk.white(s.yesterday || '—'))
    console.log(chalk.yellow('  🎯 Today     : ') + chalk.white(s.today     || '—'))
    console.log(chalk.yellow('  🚧 Blockers  : ') + chalk.white(s.blockers  || 'None'))
  }

  console.log()
  console.log(chalk.bold.yellow(`  ╚══ ${names.length} standup(s) total ══╝`))
  console.log()
}

// ── Guided standup prompt ─────────────────────────────────────────────────────
async function collectStandup (rl) {
  const answers = {}

  console.log()
  console.log(chalk.bold.cyan('  📋 Time for your daily standup!'))
  console.log(chalk.gray('  Answer the 3 questions below. Press ENTER after each.\n'))

  for (const q of QUESTIONS) {
    const answer = await new Promise((resolve) => {
      rl.question('  ' + chalk.bold.yellow(q.prompt) + '\n  → ', (ans) => {
        resolve(ans.trim() || '(no answer)')
      })
    })
    answers[q.key] = answer
  }

  return answers
}

// ── Derive DHT topic ──────────────────────────────────────────────────────────
function channelToTopic (name) {
  return crypto.createHash('sha256').update(name).digest()
}

// ── Parse schedule "HH:MM" → cron expression ─────────────────────────────────
function scheduleToCron (hhmm) {
  const parts = hhmm.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    console.error(chalk.red(`  Invalid --schedule value "${hhmm}". Using 09:00.`))
    return '0 9 * * *'
  }
  return `${m} ${h} * * *`
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main () {
  banner()
  printConfig()

  // ── Recap-only mode: just print and exit ───────────────────────────────────
  if (MODE === 'recap') {
    const standups = getTodayStandups()
    printRecap(standups)
    process.exit(0)
  }

  const topic = channelToTopic(CHANNEL)
  const swarm = new Hyperswarm()
  const peers = new Set()

  // Track who has submitted today (from network messages)
  const submittedToday = new Set(Object.keys(getTodayStandups()))

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  async function shutdown () {
    console.log(chalk.yellow('\n  Shutting down…'))
    await swarm.destroy()
    console.log(chalk.green('  Goodbye!\n'))
    process.exit(0)
  }
  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  // ── Broadcast to all peers ─────────────────────────────────────────────────
  function broadcast (msgStr) {
    let sent = 0
    for (const conn of peers) {
      try {
        conn.write(msgStr)
        sent++
      } catch (err) {
        if (!['EPIPE', 'ECONNRESET'].includes(err.code)) {
          console.error(chalk.red('  Write error: ' + err.message))
        }
      }
    }
    return sent
  }

  // ── Handle incoming message ────────────────────────────────────────────────
  function handleMessage (msg, conn) {
    if (!msg || !msg.type) return

    switch (msg.type) {

      case MSG.STANDUP: {
        const { from, yesterday, today, blockers, ts } = msg
        console.log(chalk.bold.green(`\n  📥 Standup received from ${chalk.cyan(from)}:`))
        console.log(chalk.yellow('  📅 Yesterday : ') + chalk.white(yesterday || '—'))
        console.log(chalk.yellow('  🎯 Today     : ') + chalk.white(today     || '—'))
        console.log(chalk.yellow('  🚧 Blockers  : ') + chalk.white(blockers  || 'None'))
        console.log()
        // Save to local file
        saveStandup(from, { yesterday, today, blockers, ts })
        submittedToday.add(from)
        break
      }

      case MSG.REMINDER: {
        const { from } = msg
        if (!hasMineToday()) {
          console.log(chalk.bold.yellow(`\n  🔔 Reminder from ${from}: Please submit your standup!`))
          console.log(chalk.gray('  Type /standup to fill it now.\n'))
        }
        break
      }

      case MSG.RECAP_REQ: {
        // Peer is requesting our local recap — send it back
        const standups = getTodayStandups()
        if (Object.keys(standups).length > 0) {
          const reply = makeMsg(MSG.RECAP, { standups })
          try { conn.write(reply) } catch {}
        }
        break
      }

      case MSG.RECAP: {
        const { from, standups } = msg
        console.log(chalk.bold.magenta(`\n  📊 Recap received from ${from}:`))
        // Merge with local
        for (const [name, entry] of Object.entries(standups || {})) {
          saveStandup(name, entry)
          submittedToday.add(name)
        }
        printRecap(getTodayStandups(), true)
        break
      }

      case MSG.PING: {
        console.log(chalk.gray(`\n  🏓 Ping from ${msg.from}`))
        break
      }
    }
  }

  // ── Handle new peer connections ────────────────────────────────────────────
  swarm.on('connection', (conn, info) => {
    const key = b4a.toString(info.publicKey, 'hex').slice(0, 12)
    peers.add(conn)
    console.log(chalk.green(`\n  ✓ Peer connected: ${key}… (${peers.size} total)`))

    // On connect, request their recap so we sync
    try {
      conn.write(makeMsg(MSG.RECAP_REQ))
    } catch {}

    conn.on('data', (data) => {
      const msg = parseMsg(data)
      handleMessage(msg, conn)
    })

    conn.on('close', () => {
      peers.delete(conn)
      console.log(chalk.gray(`\n  Peer disconnected. (${peers.size} remaining)`))
    })

    conn.on('error', (err) => {
      peers.delete(conn)
      if (!['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(err.code)) {
        console.error(chalk.red('  Connection error: ' + err.message))
      }
    })
  })

  // ── Join DHT ───────────────────────────────────────────────────────────────
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  console.log(chalk.green('  ✓ Listening on P2P swarm…'))
  if (hasMineToday()) {
    console.log(chalk.gray('  ✓ You already submitted your standup today.\n'))
  } else {
    console.log(chalk.yellow('  ⚠ You haven\'t submitted today\'s standup yet. Type /standup to fill it.\n'))
  }

  // ── Cron scheduler: auto-prompt + broadcast at configured time ─────────────
  const cronExpr = scheduleToCron(SCHEDULE)
  cron.schedule(cronExpr, async () => {
    console.log(chalk.bold.cyan(`\n  ⏰ Scheduled standup time! (${SCHEDULE})`))
    if (hasMineToday()) {
      console.log(chalk.gray('  Already submitted today. Skipping auto-prompt.\n'))
      return
    }
    if (MODE === 'listen') return   // listen-only nodes never auto-fill

    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answers = await collectStandup(rl2)
    rl2.close()

    const msg = makeMsg(MSG.STANDUP, answers)
    saveStandup(MY_NAME, answers)
    submittedToday.add(MY_NAME)
    const sent = broadcast(msg)
    console.log(chalk.green(`\n  ✓ Standup broadcasted to ${sent} peer(s).`))
    rl.prompt()
  })

  // ── Reminder scheduler: fire 30 min after schedule time ───────────────────
  const [rh, rm] = SCHEDULE.split(':').map(Number)
  const reminderMinute = (rm + 30) % 60
  const reminderHour   = rh + Math.floor((rm + 30) / 60)
  const reminderCron   = `${reminderMinute} ${reminderHour} * * *`

  cron.schedule(reminderCron, () => {
    const today = getTodayStandups()
    const missingCount = peers.size - Object.keys(today).length + 1   // rough count
    if (peers.size > 0) {
      const msg = makeMsg(MSG.REMINDER)
      broadcast(msg)
      console.log(chalk.bold.yellow(`\n  🔔 Reminder sent to ${peers.size} peer(s) who may not have submitted yet.`))
    }
  })

  // ── Listen-only mode: no readline needed ──────────────────────────────────
  if (MODE === 'listen') {
    console.log(chalk.gray('  Running in listen-only mode. Press Ctrl+C to exit.\n'))
    return
  }

  // ── Standup-only mode: fill once, broadcast, exit ─────────────────────────
  if (MODE === 'standup') {
    const rl0 = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answers = await collectStandup(rl0)
    rl0.close()

    saveStandup(MY_NAME, answers)
    submittedToday.add(MY_NAME)

    // Wait briefly for peers to connect, then send
    console.log(chalk.gray('\n  Waiting for peers to connect (5s)…'))
    await new Promise(r => setTimeout(r, 5000))

    const msg = makeMsg(MSG.STANDUP, answers)
    const sent = broadcast(msg)
    console.log(chalk.green(`\n  ✓ Standup broadcasted to ${sent} peer(s).`))
    console.log(chalk.gray('  Exiting standup mode.\n'))
    await swarm.destroy()
    process.exit(0)
  }

  // ── Interactive mode: full readline loop ───────────────────────────────────
  printHelp()

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('  standup> ')
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    if (input === '/standup') {
      // Temporarily pause rl so questions don't conflict
      rl.pause()
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout })
      const answers = await collectStandup(rl2)
      rl2.close()

      saveStandup(MY_NAME, answers)
      submittedToday.add(MY_NAME)

      const msg = makeMsg(MSG.STANDUP, answers)
      const sent = broadcast(msg)
      console.log(chalk.green(`\n  ✓ Standup broadcasted to ${sent} peer(s).`))

      rl.resume()
      rl.prompt()

    } else if (input === '/recap') {
      const standups = getTodayStandups()
      printRecap(standups)
      // Also request from peers
      if (peers.size > 0) {
        broadcast(makeMsg(MSG.RECAP_REQ))
        console.log(chalk.gray('  (Recap request sent to peers — their entries will appear above if received)\n'))
      }
      rl.prompt()

    } else if (input === '/reminder') {
      if (peers.size === 0) {
        console.log(chalk.yellow('  ⚠ No peers connected.\n'))
      } else {
        broadcast(makeMsg(MSG.REMINDER))
        console.log(chalk.green(`  🔔 Reminder sent to ${peers.size} peer(s).\n`))
      }
      rl.prompt()

    } else if (input === '/peers') {
      console.log(chalk.cyan(`  Connected peers: ${peers.size}\n`))
      rl.prompt()

    } else if (input === '/help') {
      printHelp()
      rl.prompt()

    } else if (input === '/quit' || input === '/exit') {
      await shutdown()

    } else if (input.startsWith('/')) {
      console.log(chalk.red(`  Unknown command: ${input}. Type /help.\n`))
      rl.prompt()

    } else {
      console.log(chalk.gray('  Tip: Use /standup to fill your standup, or /help for all commands.\n'))
      rl.prompt()
    }
  })

  rl.on('close', () => shutdown())
}

// ── Entry ─────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error(chalk.red('\n  Fatal: ' + err.message))
  console.error(err.stack)
  process.exit(1)
})
