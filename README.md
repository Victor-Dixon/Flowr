# Flowr Timer (MVP)

Single-screen timer that shows **start time**, **end time**, and **duration**, with optional **voice auto-stop** (Web Speech API) and a small local **history** (last 10 sessions). Includes **Discord bot integration** for remote timer control and agent connections.

## Run

### Option A: open the file
- Open `index.html` in a browser.

### Option B: run a local server (recommended for voice)
Some browsers only enable speech recognition on secure origins (HTTPS) or `localhost`.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Option C: Discord Bot (Node.js required)
See [DISCORD_SETUP.md](./DISCORD_SETUP.md) for detailed setup instructions.

```bash
npm install
npm start
```

## Features
- **Start / Stop / Reset**
- **Status**: Idle / Running / Stopped (+ stop reason)
- **History**: last 10 sessions in `localStorage`
- **Voice auto-stop (optional)**:
  - **Any word**: stops on first non-empty recognized transcript
  - **Keyword**: stops when transcript contains the keyword (substring match)
  - **Unsupported environments**: voice toggle is disabled; **Simulate word heard** still stops the timer for demos

## Storage
- Sessions stored in browser `localStorage` key: `flowr:sessions:v1`

## Discord Bot Features
- **Timer Control**: Start, stop, reset, and check timer status via Discord slash commands
- **Agent Connections**: Connect as Discord agents to control the timer remotely
- **Agent Management**: List connected agents and track connection status
- **Shared State**: Discord bot and web timer share the same timer state

See [DISCORD_SETUP.md](./DISCORD_SETUP.md) for setup instructions.

## Privacy
- Mic use is opt-in (voice toggle).
- No raw audio is stored.
- Transcript is not persisted (MVP).

