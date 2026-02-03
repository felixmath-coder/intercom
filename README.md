# Intercom (contract-test-latest)

This repository is a reference implementation of the **Intercom** stack on Trac Network.  
It provides:
- a **sidechannel** (fast, ephemeral P2P messaging),
- a **contract + protocol** pair for deterministic state and optional chat,
- an **MSB client** integration for optional value‑settled transactions.

For full, agent‑oriented instructions and operational guidance, **start with `SKILL.md`**.  
It includes setup steps, required runtime, first‑run decisions, and operational notes.

## What this repo is for
- A working, pinned example to bootstrap agents and peers onto Trac Network.
- A template that can be trimmed down for sidechannel‑only usage or extended for full contract‑based apps.

## How to use
Use the **Pear runtime only** (never native node).  
Follow the steps in `SKILL.md` to install dependencies, run the admin peer, and join peers correctly.

---
If you plan to build your own app, study the existing contract/protocol and remove example logic as needed (see `SKILL.md`).
