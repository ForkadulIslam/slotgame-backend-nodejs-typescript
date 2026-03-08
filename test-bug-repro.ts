import {
    gameRegistry
} from './src/games/activeGame.js';
import { getRoundData, getCustomScenarioData } from "./src/data.js";


import {
    SymbolsCombinationsGenerator,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
    VideoSlotWithFreeGamesRoundNetworkData,
} from "pokie";

// --- EXACT app.ts ARCHITECTURE MOCK ---

// Session management
interface GameSession {
    session: VideoSlotWithFreeGamesSession;
    serializer: VideoSlotWithFreeGamesSessionSerializer;
    scenarios: any;
    lastActivityTime: number; // Heartbeat for RAM cleanup
}

const activeSessions = new Map<string, GameSession>();

const createNewSession = (gameId: string = "classic"): GameSession => {
    const game = gameRegistry[gameId] || gameRegistry["classic"];
    const config = new game.SwfgConfig();
    const combinationsGenerator = new SymbolsCombinationsGenerator(config);
    const winCalculator = new game.SwfgSessionWinCalculator(config);
    const session = new game.SwfgSession(config, combinationsGenerator, winCalculator);
    const serializer = new VideoSlotWithFreeGamesSessionSerializer();
    return { 
        session, 
        serializer, 
        scenarios: game.customScenarios,
        lastActivityTime: Date.now() // Initial heartbeat
    };
}

const getOrCreateSession = (sessionId: string, gameId?: string): GameSession => {
    if (!activeSessions.has(sessionId)) {
        console.log(`Creating new session for id: ${sessionId} (Variant: ${gameId || 'default/classic'})`);
        activeSessions.set(sessionId, createNewSession(gameId));
    }
    const container = activeSessions.get(sessionId)!;
    container.lastActivityTime = Date.now(); // Update heartbeat on every access
    return container;
}

async function runBugReproduction() {
    console.log("=== ARCHITECTURAL BUG REPRODUCTION: PIXEL-PERFECT app.ts REPLICA ===");

    const gameId = "mega-win";
    const sessionIdA = "player-a";
    const sessionIdB = "player-b";
    const scenarioId = "fg";

    // STEP ONE: Initialize following start-session/spin approach in app.ts
    console.log("\n[Step 1] Initializing Player A & B sessions...");
    
    // Player A logic from /start-session and /spin
    {
        const { session, serializer } = getOrCreateSession(sessionIdA, gameId);
        session.setCreditsAmount(1000);
        session.setBet(1);
        await getRoundData(session, serializer);
        console.log(`Player A initialized. Credits in memory: ${session.getCreditsAmount()}`);
    }

    // Player B logic from /start-session and /spin
    {
        const { session, serializer } = getOrCreateSession(sessionIdB, gameId);
        session.setCreditsAmount(1000);
        session.setBet(1);
        await getRoundData(session, serializer);
        console.log(`Player B initialized. Credits in memory: ${session.getCreditsAmount()}`);
        console.log("CRITICAL: Player B's config is now the shared static pointer for 'Classic' variant.");
    }

    // STEP TWO: Fast forward simulation for Player B (following /simulation endpoint in app.ts)
    console.log(`\n[Step 2] Player B triggers /simulation?id=${scenarioId}...`);
    {
        // Retrieve stored game engine from memory for Player B
        const { session, serializer, scenarios } = getOrCreateSession(sessionIdB, gameId);
        
        // Ensure player b's credit amount retrieve from memory and set it for the simulation
        session.setCreditsAmount(session.getCreditsAmount());

        // Ensure the scenarioId is checking with players b's in-memory game config
        const isValidScenario = scenarios.some((s:any) => s[0] === scenarioId);
        if (!isValidScenario) {
            console.log(`Invalid scenario id: ${scenarioId}`);
            return;
        }
        console.log(`Check Player B's credit before simulation, Player B Credits : ${session.getCreditsAmount()}`)
        const data = await getCustomScenarioData(session, serializer, scenarios, scenarioId);
        console.log(`Simulation complete. Player B Credits: ${session.getCreditsAmount()}`);
        
        // Confirm Player B is now in Free Games Mode
        // We verify by accessing the config through the session reference in memory
        const isB_Free_Pre = (session as any).swfgConfig.isFreeGamesMode();
        console.log(`VERIFICATION: Player B 'isFreeGamesMode' before A's interaction: ${isB_Free_Pre}`);
    }

    // STEP THREE: Run a spin for Player A and observe the impact on Player B
    console.log("\n[Step 3] Player A triggers /spin (retrieving from memory)...");
    {
        // Retrieve stored game engine from memory for Player A
        const { session: sessionA, serializer: serializerA } = getOrCreateSession(sessionIdA, gameId);
        
        // Re-hydrate balance from "Redis" (simulated memory state)
        sessionA.setCreditsAmount(sessionA.getCreditsAmount());
        sessionA.setBet(1);

        // Execution logic from app.ts /spin
        console.log(`Before spin Player A Credits: ${sessionA.getCreditsAmount()}`)
        await getRoundData(sessionA, serializerA);
        console.log("Player A: Spin completed. Logic executed 'setFreeGamesMode(false)'. Now Credits:"+ sessionA.getCreditsAmount());
    }

    // THE AUDIT: Retrieve both from memory and compare game modes
    console.log("\n=== FINAL ARCHITECTURAL AUDIT ===");
    
    const { session: containerB, serializer: serializerB } = getOrCreateSession(sessionIdB, gameId);
    const { session: containerA, serializer: serializerA } = getOrCreateSession(sessionIdA, gameId);

    await getRoundData(containerB, serializerB);
    console.log(`After one more spin of player B, Credits: ${containerB.getCreditsAmount()} [Expected == step 2], freeGameSum: ${containerB.getFreeGamesSum()}, [Expected > 0]`);

    await getRoundData(containerA, serializerA);
    console.log(`After one more spin of player A, Credits: ${containerA.getCreditsAmount()} [Expected != previous amount], freeGameSum: ${containerA.getFreeGamesSum()}, [Expected 0]`);

    const isA_Final = (containerA as any).swfgConfig.isFreeGamesMode();
    const isB_Final = (containerB as any).swfgConfig.isFreeGamesMode();

    console.log(`Player A (Current Spin) Config Mode: ${isA_Final}`);
    console.log(`Player B (Target Session) Config Mode: ${isB_Final} (EXPECTED: true)`);

    if (isB_Final === false) {
        console.log("\n[!!!] BUG IDENTIFIED [!!!]");
        console.log("The 'static config' property caused Player A's normal spin logic");
        console.log("to reach into Player B's memory space and deactivate their Free Games mode.");
        console.log("This confirms the architecture is not concurrent-safe.");
    } else {
        console.log("\n[SUCCESS] No leakage detected.");
    }
}

runBugReproduction();
