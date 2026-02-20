# SKILL: intercom-standup

**Version:** 1.0.0
**Author Trac Address:** `[INSERT_YOUR_TRAC_ADDRESS_HERE]`
**Competition:** Intercom Vibe Competition — Trac Systems
**Category:** Productivity / Team Coordination / P2P Tooling

---

## What This Skill Does

`intercom-standup` is a **Decentralized P2P Daily Standup Bot** built on Hyperswarm. It removes the need for any central server, Slack workspace, or group chat to run a daily team standup. Each peer runs the same script; standups are broadcast directly between participants over an encrypted P2P mesh.

### Core Capabilities

| Capability | Description |
|---|---|
| **Guided Standup Form** | 3-question prompt (Yesterday / Today / Blockers) |
| **Auto-Scheduler** | Cron-based trigger at a configured time (default: 09:00) |
| **Reminder Broadcast** | Nudges peers who haven't submitted 30 min after schedule time |
| **Daily Recap** | Aggregates all received standups into a formatted summary |
| **Sync on Connect** | New peers automatically request existing standups on join |
| **Persistent Cache** | `standups.json` stores today's entries locally (no heavy DB) |

---

## Skill Trigger Phrases

Other agents should invoke this skill when they detect any of the following intents:

- "submit standup"
- "what's today's standup?"
- "show team standup"
- "daily update"
- "share blockers"
- "what is everyone working on?"
- "remind team to standup"
- "intercom standup"
- "p2p standup"
- "daily recap"

---

## Agent Interaction Protocol

All messages are JSON over raw Hyperswarm connections.

### Message Envelope Format

```json
{
  "v":    "1.0.0",
  "type": "standup | reminder | recap_req | recap | ping",
  "from": "<display_name_or_trac_address>",
  "ts":   1700000000000
}
```

### Message Types

#### `standup` — Submit a standup entry
```json
{
  "v": "1.0.0",
  "type": "standup",
  "from": "Alice",
  "ts": 1700000000000,
  "yesterday": "Finished API integration",
  "today": "Write unit tests",
  "blockers": "None"
}
```

#### `reminder` — Nudge peers who haven't submitted
```json
{
  "v": "1.0.0",
  "type": "reminder",
  "from": "StandupBot",
  "ts": 1700000000000
}
```

#### `recap_req` — Request today's standups from a peer
```json
{
  "v": "1.0.0",
  "type": "recap_req",
  "from": "Alice",
  "ts": 1700000000000
}
```

#### `recap` — Full recap payload in response to `recap_req`
```json
{
  "v": "1.0.0",
  "type": "recap",
  "from": "Bob",
  "ts": 1700000000000,
  "standups": {
    "Alice": {
      "yesterday": "Finished API integration",
      "today": "Write unit tests",
      "blockers": "None",
      "savedAt": "2025-07-04T09:05:00.000Z"
    }
  }
}
```

#### `ping` — Liveness check
```json
{
  "v": "1.0.0",
  "type": "ping",
  "from": "Alice",
  "ts": 1700000000000
}
```

---

## How Agents Connect

All peers derive the DHT topic identically:

```js
const topic = require('crypto')
  .createHash('sha256')
  .update('intercom-standup-v1')   // default channel
  .digest()
```

Custom channels via `--topic=<name>` use the same derivation with the custom string.

Connecting:
```js
const Hyperswarm = require('hyperswarm')
const swarm = new Hyperswarm()
swarm.join(topic, { server: true, client: true })
swarm.on('connection', (conn) => {
  conn.on('data', (raw) => {
    const msg = JSON.parse(raw.toString())
    // handle msg.type
  })
})
```

---

## CLI Commands

| Command | Effect |
|---|---|
| `/standup` | Start guided 3-question form and broadcast result |
| `/recap` | Display today's collected standups + request from peers |
| `/reminder` | Broadcast reminder to all connected peers |
| `/peers` | Show connected peer count |
| `/help` | Show command list |
| `/quit` | Exit gracefully |

---

## Startup Flags

| Flag | Default | Description |
|---|---|---|
| `--mode` | `interactive` | `interactive` \| `standup` \| `listen` \| `recap` |
| `--topic` | `intercom-standup-v1` | P2P channel / team name |
| `--schedule` | `09:00` | Daily auto-broadcast time (HH:MM) |
| `--name` | `peer-<random>` | Your display name in standups |

---

## Data Storage

Standups are persisted to **`standups.json`** in the project directory.

```json
{
  "2025-07-04": {
    "Alice": {
      "yesterday": "...",
      "today": "...",
      "blockers": "...",
      "savedAt": "2025-07-04T09:02:00.000Z"
    },
    "Bob": { ... }
  }
}
```

- One file, plain JSON — no database needed
- Only today's date key is actively written; old dates remain for history
- Safe to delete; a fresh file is created on next run

---

## Security Notes

- All Hyperswarm connections use **end-to-end Noise protocol encryption**
- The channel topic is SHA-256 of the channel name — treat it as a shared secret
- Use `--topic=<random-string>` for private team channels
- No data is sent to any third-party server

---

## Limitations

- No message history replay for peers who join late (they only get what's in peers' local `standups.json` via `recap_req`)
- Display names are self-declared; no authentication of identity
- Requires all team members to be on the same `--topic` channel
- `node-cron` requires the process to stay running for auto-scheduling to trigger

---

## Example: Automated Agent Integration

```js
// An Intercom agent that listens for standups and posts to a webhook
swarm.on('connection', (conn) => {
  conn.on('data', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.type === 'standup') {
      postToWebhook({
        text: `*${msg.from}* standup:\n• Yesterday: ${msg.yesterday}\n• Today: ${msg.today}\n• Blockers: ${msg.blockers}`
      })
    }
    if (msg.type === 'reminder') {
      triggerLocalNotification('Time for your standup!')
    }
  })
})
```

---

## Trac Systems Intercom Compatibility

- Runs as a standalone Node.js process alongside any Intercom agent
- Uses the same Hyperswarm DHT infrastructure as the broader Intercom ecosystem
- Designed for composition: standups can trigger downstream automation in other agents
- All messages follow a versioned JSON envelope for forward-compatibility
