# Gemini Project Context: Slot Game Backend (Node.js/TypeScript)

This project is a backend server for a suite of slot games, built with Node.js and TypeScript. It utilizes the `pokie` library for core slot mechanics and integrates with Redis for session persistence and an external Laravel-based API for user balance management.

## Project Overview

- **Core Engine:** Uses the `pokie` library to handle reels, winning combinations, and free game logic.
- **Game Variants:** Supports multiple game configurations located in `src/games/`:
  - `slot-with-free-games-classic`: Standard volatility/RTP.
  - `slot-with-free-games-high-frequency`: More frequent wins, lower payouts.
  - `slot-with-free-games-mega-win`: High risk, high reward (currently active in `app.ts`).
- **Persistence:** Redis is used to store session states (`slot_ptr_{sessionId}`) and user-to-session mappings (`user_session:{userId}`).
- **External Integration:**
  - Fetches user data/balance from `BACKEND_API_BASE_URL/api/user_by_id/{userId}`.
  - Updates user balance on the external backend via `BACKEND_API_BASE_URL/api/user_balance_update`.
- **Concurrency Control:** Uses `async-lock` to ensure atomic updates to user balances and session states.

## Key Components

- `app.ts`: The main Express server. It defines API endpoints for starting sessions, spinning, and running simulations.
- `src/games/`: Directory containing game-specific configurations (`SwfgConfig.ts`), session logic (`SwfgSession.ts`), and win calculators (`SwfgSessionWinCalculator.ts`).
- `session-finalizer.js`: A background worker that periodically scans Redis for inactive sessions (based on `lastActivityTime`) and synchronizes the final state/balance with the external backend.
- `src/data.ts`: Helper functions to transform `pokie` session data into network-ready JSON responses for the frontend.
- `src/games/.../index.ts`: Entry points for game variants, often defining simulation scenarios.

## API Endpoints

- `POST /start-session`: Initializes a new game session for a user.
- `GET /user-session-status`: Retrieves the current state of a session.
- `GET /spin`: Executes a game round.
- `GET /simulation`: Runs a specific game scenario (e.g., "Free Games").
- `GET /user-session-simulation`: Runs a batch simulation (e.g., 10,000 rounds) to calculate RTP and volatility for the current session.

## Building and Running

### Development
- **Start Server:** `npm run dev:server` (uses nodemon)
- **Start Client (if applicable):** `npm run dev:client` (uses vite)

### Production
- **Build Server:** `npm run build:server` (compiles TS to `dist-server/`)
- **Build All:** `npm run build`

### Background Worker
- **Run Finalizer:** `node session-finalizer.js` (Ensure `.env` is configured for Redis and Backend API).

## Environment Variables (.env)
- `PORT`: Server port (default: 3002).
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`: Redis connection details.
- `BACKEND_API_BASE_URL`: URL of the external Laravel-based user management API.

## Development Conventions

- **TypeScript:** Strict typing is preferred. Use interfaces for session and response data.
- **Modularity:** Keep game-specific logic within its respective directory in `src/games/`.
- **Code Style:** Prettier is used for formatting.
- **Async Safety:** Always use `AsyncLock` when performing operations that read and then write back to Redis to prevent race conditions.
- **Simulation:** Use the simulation endpoints to verify RTP and game balance after making changes to paytables or reel sequences.
