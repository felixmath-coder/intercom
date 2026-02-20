# 🗓️ intercom-standup

> **Decentralized P2P Daily Standup Bot**
> No Slack. No server. No accounts. Just P2P.
> Built on Hyperswarm · Intercom Vibe Competition Entry
> Author Trac Address: trac1d46lyj7r83sj8sgtrlc83we6p78u5qhxzt5cswzn3z5qut9a5qfqufvc23

---

## The Problem It Solves

Daily standups usually require a central service — Slack, Discord, a spreadsheet, a bot with a token. When that service goes down, changes pricing, or requires a login, your workflow breaks.

**intercom-standup** runs between devices directly. Your team shares a channel name. Everyone runs the same script. Standups are broadcast peer-to-peer, collected locally, and shown as a formatted daily recap — with zero infrastructure to maintain.

---

## Features

| Feature | Details |
|---|---|
| 📝 **Guided Standup Form** | 3 questions: Yesterday / Today / Blockers |
| ⏰ **Auto-Scheduler** | Cron fires at your configured time (default 09:00) |
| 🔔 **Reminder Broadcast** | Pings peers who haven't submitted 30 min after schedule |
| 📊 **Daily Recap** | Aggregates all standups into a clean summary |
| 🔄 **Auto-Sync on Join** | Late joiners automatically request existing standups |
| 💾 **Local Persistence** | Saves to `standups.json` — no database required |
| 🔒 **E2E Encrypted** | Hyperswarm Noise protocol on all connections |
| 📱 **Termux Ready** | Tested on Android, no root needed |

---

## Architecture

```
[Alice — Termux/Android]         [Bob — Desktop]          [Carol — Desktop]
      index.js                      index.js                   index.js
         │                              │                           │
         └──────────── Hyperswarm DHT (SHA-256 topic) ─────────────┘
                        (UDP hole-punching, no relay server)

  On connect: each peer sends recap_req → others reply with standups.json
  At 09:00:  each peer's cron fires → prompts user → broadcasts standup
  At 09:30:  reminder broadcast to anyone who hasn't submitted
```

---

## Quick Start

### 📱 Termux (Android)

```bash
# 1. Update and install Node.js
pkg update && pkg upgrade -y
pkg install nodejs git -y

# 2. Clone the repo
git clone 
cd intercom-standup

# 3. Install dependencies
npm install

# 4. Run with your name and team channel
node index.js --name=Alice --topic=myteam
```

### 🖥️ Desktop (Linux / macOS / Windows WSL)

```bash
git clone 
cd intercom-standup
npm install
node index.js --name=Bob --topic=myteam
```

Both Alice and Bob will discover each other via the DHT within ~10 seconds.

---

## Usage

### Interactive Mode (Default)

```bash
node index.js --name=Alice --topic=myteam
```

At the prompt, type `/standup` to fill your standup and broadcast it.

### Fill standup immediately and exit

```bash
node index.js --mode=standup --name=Alice --topic=myteam
```

Guides you through 3 questions, broadcasts, then exits. Perfect for cron jobs.

### Listen only (receive standups, don't broadcast)

```bash
node index.js --mode=listen --name=RecapBot --topic=myteam
```

### Print today's collected recap and exit

```bash
node index.js --mode=recap
```

### Custom schedule time

```bash
# Auto-prompt at 08:30 every morning
node index.js --name=Alice --topic=myteam --schedule=08:30
```

---

## Commands (Interactive Mode)

| Command | Description |
|---|---|
| `/standup` | Launch guided 3-question form and broadcast |
| `/recap` | Show today's standups + request from peers |
| `/reminder` | Ping all peers who haven't submitted yet |
| `/peers` | Show number of connected peers |
| `/help` | Show all commands |
| `/quit` | Exit cleanly |

---

## Flags Reference

| Flag | Default | Description |
|---|---|---|
| `--name` | `peer-<random>` | Your display name in standups |
| `--topic` | `intercom-standup-v1` | Team channel name (shared secret) |
| `--mode` | `interactive` | `interactive` · `standup` · `listen` · `recap` |
| `--schedule` | `09:00` | Auto-standup time in HH:MM (24h) |

---

## Standup Questions

Every standup captures three things:

1. **Yesterday** — What did you accomplish?
2. **Today** — What are you working on?
3. **Blockers** — Anything slowing you down?

Answers are broadcast as a JSON envelope and saved to `standups.json`.

---

## Example Session

```
╔═══════════════════════════════════════════════════════════════╗
║   INTERCOM-STANDUP  v1.0.0                                    ║
║   Decentralized P2P Daily Standup Bot                         ║
╚═══════════════════════════════════════════════════════════════╝

  Channel  : myteam
  Name     : Alice
  Mode     : interactive
  Schedule : 09:00 daily

  ✓ Listening on P2P swarm…
  ⚠ You haven't submitted today's standup yet. Type /standup to fill it.

  standup> /standup

  📋 Time for your daily standup!

  📅  What did you do YESTERDAY?
  → Finished the auth module and wrote tests

  🎯  What will you do TODAY?
  → Review Bob's PR and start on the dashboard

  🚧  Any BLOCKERS or issues?
  → Waiting on API keys from DevOps

  ✓ Standup broadcasted to 2 peer(s).

  standup> /recap

  ╔══ DAILY RECAP — 2025-07-04 ══╗

  👤 Alice
  ─────────────────────────────────
  📅 Yesterday : Finished the auth module and wrote tests
  🎯 Today     : Review Bob's PR and start on the dashboard
  🚧 Blockers  : Waiting on API keys from DevOps

  👤 Bob
  ─────────────────────────────────
  📅 Yesterday : Set up CI pipeline
  🎯 Today     : Fix flaky tests
  🚧 Blockers  : None

  ╚══ 2 standup(s) total ══╝
```

---

## Data Storage

Standups are saved to `standups.json` in the project folder:

```json
{
  "2025-07-04": {
    "Alice": {
      "yesterday": "Finished the auth module",
      "today": "Review Bob's PR",
      "blockers": "Waiting on API keys",
      "savedAt": "2025-07-04T09:02:00.000Z"
    }
  }
}
```

- Plain JSON — open in any text editor
- One date key per day; history accumulates naturally
- Safe to delete; fresh file created on next run

---

## Privacy & Security

- All connections use **Noise protocol end-to-end encryption** (via Hyperswarm)
- Your team channel name is the shared secret — pick something non-guessable
- Generate a random channel: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
- No data ever leaves the P2P mesh to a third-party server

---

## Dependencies

| Package | Purpose |
|---|---|
| `hyperswarm` | P2P peer discovery and direct connections |
| `hypercore-crypto` | Cryptographic primitives |
| `b4a` | Buffer/Uint8Array interop |
| `chalk` | Terminal colors (graceful fallback if missing) |
| `minimist` | Argument parsing |
| `node-cron` | Cron scheduler for auto-standup trigger |

---

## Termux Quick-Reference Card

```
┌────────────────────────────────────────────────────────────────┐
│  TERMUX QUICK START — intercom-standup                         │
├────────────────────────────────────────────────────────────────┤
│  pkg update && pkg upgrade -y                                  │
│  pkg install nodejs git -y                                     │
│  git clone https://github.com/[YOUR]/intercom-standup         │
│  cd intercom-standup && npm install                            │
│  node index.js --name=YourName --topic=yourteam               │
├────────────────────────────────────────────────────────────────┤
│  /standup   → fill & broadcast your standup                    │
│  /recap     → show today's team standups                       │
│  /reminder  → ping peers to submit                             │
│  /peers     → count connected peers                            │
│  Ctrl+C     → quit                                             │
└────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

**"node: command not found"** → `pkg install nodejs -y`

**Peers not connecting** — Wait up to 30s; Hyperswarm DHT lookup takes time on first run. Both peers need active internet.

**"ECONNRESET" in output** — Normal; a peer disconnected cleanly.

**node-cron not triggering** — Make sure the process stays running in the background. On Termux, use `nohup node index.js &` or a Termux session that won't be killed.

**Keep alive on Termux** — Acquire a Termux wakelock: `termux-wake-lock` (requires Termux:API app).

---

## Contributing

1. Fork the repo
2. `npm install`
3. Make your changes
4. Submit a PR

---

## License

MIT ©  trac1d46lyj7r83sj8sgtrlc83we6p78u5qhxzt5cswzn3z5qut9a5qfqufvc23

---

## Competition Info

**[Intercom Vibe Competition](https://github.com/Trac-Systems/intercom)** — Trac Systems

- **Trac Address:** `[INSERT_YOUR_TRAC_ADDRESS_HERE]`
- **Category:** Productivity / P2P Tooling
- **Platform:** Node.js + Termux (Android)
- **Tech:** Hyperswarm DHT · Holepunch / Pear ecosystem · node-cron
