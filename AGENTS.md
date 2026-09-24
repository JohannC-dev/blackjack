# Minuit

Minuit is a browser-based multiplayer casino built around Blackjack, Texas Hold'em, Roulette, Tower, Chicken, Mines, and Plinko. Players use shared fictional credits across games. The project is under active development; game rules, server protocols, and parts of the interface may evolve.

## What makes Minuit special?

### 1. One wallet across every game

The player's credit balance is shared by all games. PostgreSQL is the source of truth, and the server validates every wager, payout, refund, and refill. Treat wallet correctness as part of the game rules.

When adding a game, use the existing `GameWallet` contract in `server/game-wallet.ts` and the shared wallet transaction path. Do not add a game-specific balance, ledger, or client-side authority.

### 2. Realtime games with different social models

Minuit has several kinds of multiplayer experience. A new game must use the shared Socket.IO connection and the existing server protocol; do not create a second connection or rebuild session and transport handling.

Before implementing a new game, ask the user which interaction model applies:

| Model | Examples | Expected experience |
| --- | --- | --- |
| Shared competitive table | Poker | Players share a table, take turns, and may have private information such as hole cards. |
| Shared round and result | Blackjack, Roulette | Several players act or place wagers around the same table and settle against a common round or outcome. |
| Solo run with a room feed | Tower | Each player has an independent run, while the room shows other players' public progress. Chicken has a similar room experience. |
| Isolated solo game | Mines | The board and result belong to one player; there is no shared room or view of other players' games. |

Use the answer to choose the right state, room, and broadcast behavior. Reuse `src/lib/use-game.ts`, the handlers in `server/index.ts`, and the room primitives in `server/rooms.ts` where they fit. Keep private game information out of public snapshots. Do not assume every game should use a shared table just because it uses sockets.

### 3. Server-owned outcomes

The server owns game state, random outcomes, deadlines, wager validation, and settlement. Validate every socket command and derive the acting player from the authenticated connection. A client-provided balance, player id, wager result, or game snapshot is never proof of authority.

### 4. Shared audio and cosmetics

The app already has a global audio provider and a cosmetics collection. Extend these systems when a game needs sound or player skins instead of adding parallel preference, loading, or collection systems.

## Questions to settle for a new game

Before choosing the game architecture, ask which of the four interaction models above the user intends. Also ask whether any game element should have equippable skins, and which element it is.

Check whether the existing sound effects fit the game. If the game needs distinct sounds, add game-specific effects or assets while using the existing audio context and sound preference.

## Wager selection controls

For most new games, use the shared wager controls already used by Mines and Tower: `BetChipPicker`, `ChipSlider`, and the related layout components in `src/components/ui/game-controls.tsx`. When game mechanics call for selecting chip denominations and placing wagers on board targets, follow the Roulette pattern in `src/components/games/roulette/roulette-casino.tsx` and `src/components/games/roulette/roulette-board.tsx`. Blackjack and Poker are established exceptions with their own table and game-specific betting controls; preserve those patterns when changing either game.

## Audio

`src/lib/audio-context.tsx` provides the shared `AudioProvider`, sound preference, and `AudioContext`. Game components should use `useGameAudio(...preloaders)` and pass its `contextRef.current` to their sound helpers. Do not create another provider or audio context for an individual game.

There are already sound assets in `public/audio/poker/` and `public/audio/tower/`. Several other game effects are synthesized with Web Audio. A game may still need its own specific samples or synthesis; keep those helpers game-specific (for example, `src/lib/<game>-audio.ts`) and preload through the shared context.

## Skins

Ask whether a new game has an element players should be able to customize. Existing skin kinds are `card-back`, `profile-icon`, `chicken`, and `mine-gem`. Keep a built-in Classic rendering as the fallback, including when a skin image is missing or fails to load.

For a skin that uses an existing kind, add a catalogue entry to `cosmetics/catalogue/manifest.json` and place its image beside the manifest. Give each item a stable, never-reused id, the correct kind, name, description, rarity, status, sort order, and asset filename. The importer accepts SVG, PNG, and WebP assets up to 256 KB; SVGs must not contain active content or external links. Follow the asset dimensions used by that kind.

The catalogue manifest and images are imported into the database with `bun run cosmetics:import cosmetics/catalogue`; the importer also supports `--dry-run`. Importing changes persistent database data, so do not run it unless the task explicitly calls for loading the catalogue.

Adding a new kind requires code and schema support because each kind needs a renderer. Update `src/lib/cosmetics.ts`, the database kind constraint in `server/db/schema.ts` with a Drizzle migration, the asset ratio validation in `server/cosmetics/assets.ts`, and the game rendering and collection preview. Use `SkinImage` from `src/components/ui/skin-image.tsx` to render images with the Classic fallback. Read `docs/adr/0003-skins.md` for the full catalogue, ownership, equipment, and visibility rules.

## A note on product taste

We like ambitious games, clear rules, and interfaces that make the next action obvious. Reuse existing patterns before adding abstractions. Keep each game independent where its rules require it, while sharing account, wallet, socket, audio, and cosmetics infrastructure. Complete the player journey affected by a change without expanding its scope unnecessarily.

## A small glossary

- **player** means an authenticated account playing a game;
- **credits** means fictional in-game currency, not real money;
- **wallet** means the shared credit balance and its server-side ledger;
- **table** means a shared game state for table-based games;
- **room** means a Socket.IO group whose members receive the same public updates;
- **engine** means the server-side rules and state for a game;
- **skin** means an owned, equippable cosmetic item that does not change game rules.

## Three ways to hurt yourself

1. **Rebuilding shared services or flooding wallet persistence.** Do not create a second wallet, Socket.IO connection, audio preference/provider, or cosmetics collection for one game. Keep wallet writes proportional to player commands: aggregate multi-play actions into a small number of ledger operations and one database transaction, rather than writing once per ball, chip, animation step, or sub-event. Follow Plinko's salvo pattern: one wager and, when needed, one payout for the batch while still recording each play for game stats. Excessive wallet writes slow commands and create unnecessary database and ledger traffic.
2. **Trusting the browser.** Authenticate and validate commands on the server. Send each player only the game information they are allowed to see.
3. **Discarding persistent or live state.** Do not kill a process using a development port, reset a database, or run destructive database operations to make a task convenient.

## Hit every relevant surface

Before calling a user-visible game change complete, consider which of these apply:

- **Layouts:** narrow phone, wider phone, and desktop;
- **Game states:** waiting, active, success, loss, cashout, error, and disabled actions;
- **Credits:** sufficient balance, insufficient balance, wager, payout, refund, and refill where relevant;
- **Realtime:** multiple players, room membership, private information, disconnect, and reconnect;
- **Preferences:** sound enabled or disabled, reduced motion, and the existing visual theme;
- **Reverse states:** joining and leaving a table or room, and starting or ending a run.

Only cover the surfaces relevant to the task.

## Development servers and browser

- Reuse a development server that is already running when possible. Do not start a duplicate server for the same task.
- Never kill or stop a process to free a development port. If the desired port is occupied, use the next available port, for example `PORT=3001 bun run dev`.
- Browser use is allowed for inspection and verification. Use the running app or start it on an available port; browser or computer-control use does not require separate permission.
- Do not run database migrations, seeds, imports, grants, or cleanup against persistent data unless the requested task calls for that operation.

## Verifying

Use the smallest relevant verification for a change. The project has focused unit and multiplayer tests in `tests/`, plus UI checks using Playwright. Do not run broad checks when a focused check is sufficient. A user-visible game change can be inspected in a browser at both phone and desktop widths.

## How it works

The client uses Next.js 16.3.5, React, and TypeScript. The custom server in `server/index.ts` serves the app and Socket.IO protocol. Bun runs development and scripts; production starts the persistent TypeScript server with Node.

Socket.IO carries authenticated game commands and realtime snapshots. Effect coordinates game services and error handling. Drizzle and PostgreSQL persist Better Auth accounts, sessions, wallet balances, and the wallet ledger. Individual game state is currently held in server memory unless the game implementation says otherwise.

## Where code lives

- `src/app` — Next.js routes, layout, and page entry points;
- `src/components/games` — game interfaces;
- `src/components/ui` — shared game and interface components;
- `src/lib` — client contexts, Socket.IO game hook, shared types, rules, audio, and cosmetics;
- `server` — game engines, Socket.IO handlers, room services, authentication, and HTTP routes;
- `server/db` — Drizzle schema, database access, and migrations;
- `server/cosmetics` — cosmetic catalogue, equipment, and asset endpoints;
- `cosmetics/catalogue` — versioned skin manifest and source images;
- `scripts` — database-adjacent maintenance and cosmetics scripts;
- `docs/adr` — architecture decisions.

## Database and game state

PostgreSQL is authoritative for account identity and wallet balances. A game engine should declare wallet changes through `GameWallet`; the server applies a command's changes atomically through the shared database path. Give every wallet operation a stable id and a clear game reason.

In-memory game state is lost when the server process restarts. Preserve the existing persistence and reconnect behavior of each game, and do not claim a run or hand is durable unless its state is stored durably. When a feature needs a schema change, update the Drizzle schema and add a migration; never edit generated migration metadata by hand.

## Taste

- Keep user-facing app copy in French; keep code identifiers and developer documentation in English.
- Keep game rules and random outcomes on the server.
- Prefer existing components, services, and visual conventions before adding dependencies or abstractions.
- Preserve mobile usability, keyboard access, reduced-motion support, and readable game state.
- Keep animation work tied to meaningful game events and avoid unnecessary continuous repainting.
- Preserve unrelated changes in a dirty worktree.
- Do not commit, push, or open a pull request unless explicitly requested.
