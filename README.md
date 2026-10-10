# Agent Office

See every Claude Code session on your machine as a cartoon character at a desk in a 3D office, live.

- **Working** agents type away, with a blue monitor.
- **Needs you** agents wave with an amber `!`: they asked a question and are waiting for you.
- **Done** agents lean back with a coffee (`…`): their turn is over and the session is still open.
- **Finished** agents stand next to their chair with a blue ✓: they completed and exited.
- **Stale** agents slump over the keyboard (`zz`): the session ended before finishing.

Click an agent to see its project, branch and last message, and the `claude attach` command to pick it up.
Finished and stale agents have a **Got it** button that sends them out the door for good.

## Run it

```sh
npx github:claudekwanhyonglee/agent-office
```

Then open the URL it prints: http://127.0.0.1:4321. To use another port, set `PORT`, e.g. `PORT=5000`.

The first run downloads and builds the app, so it takes a minute.

### On your phone or another computer

To open the office from other devices on your home network, start it with `--lan`:

```sh
npx github:claudekwanhyonglee/agent-office --lan
```

Or set `LAN=1`, e.g. `LAN=1 npx github:claudekwanhyonglee/agent-office`. It then also prints an
`On your network: http://<ip>:4321` line for each of this machine's network addresses; open one of those.

There is no login: anyone on your network can see the office and press **Got it**. Only use it on a network you trust.

## Requirements

- Node.js 20 or newer
- Claude Code, a version that supports `claude agents --json` (run `claude update` if it doesn't)
- A browser with WebGL

Works on macOS, Linux and Windows.

## Privacy

Agent Office only reads local Claude Code data, and never sends anything anywhere.

- It runs `claude agents --json --all` and reads session transcripts in your Claude config folder
  (`$CLAUDE_CONFIG_DIR`, or `.claude` in your home folder).
- The only thing it writes is the list of agents you dismissed with Got it, in `.agent-office/acknowledged.json`
  in your home folder.
- By default the server listens on 127.0.0.1 only, so other machines can't reach it.
  With `--lan` (or `LAN=1`) it listens on your network too, and anyone on that network can see the office
  and press Got it; it still refuses requests addressed to any other host name.
- The page loads nothing from the internet.
- It shows sessions; it never controls them.

## Develop

```sh
npm install
npm test          # Vitest
npm run typecheck
npm start         # builds if needed, then serves
npm run dev       # Vite dev server for the page (run npm start alongside for the API)
```
