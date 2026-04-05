
import {
    SymbolsCombinationsGenerator,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
} from "pokie";
import { gameRegistry } from './src/games/activeGame.js';

async function test() {
    const game = gameRegistry["classic"];
    const config = new game.SwfgConfig();
    const combinationsGenerator = new SymbolsCombinationsGenerator(config);
    const winCalculator = new game.SwfgSessionWinCalculator(config);
    const session = new game.SwfgSession(config, combinationsGenerator, winCalculator);
    const serializer = new VideoSlotWithFreeGamesSessionSerializer();

    session.setCreditsAmount(100000);
    session.setBet(1);

    console.log("Starting test...");

    let triggered = false;
    for (let i = 0; i < 1000; i++) {
        session.play();
        const data = serializer.getRoundData(session);
        const won = data.wonFreeGamesNumber || 0;
        const current = data.freeGamesNum || 0;
        const sum = data.freeGamesSum || 0;

        if (won > 0) {
            console.log(`Round ${i} (TRIGGER): won=${won}, current=${current}, sum=${sum}`);
            triggered = true;
            // Play through the free games
            let freeGameIndex = 1;
            while (session.getFreeGamesNum() > 0 || session.getWonFreeGamesNumber() > 0) {
                session.play();
                const fData = serializer.getRoundData(session);
                console.log(`  Free Game ${freeGameIndex}: won=${fData.wonFreeGamesNumber}, current=${fData.freeGamesNum}, sum=${fData.freeGamesSum}`);
                freeGameIndex++;
                if (freeGameIndex > 100) break; // safety
            }
            // One more play to see what happens when it's over? 
            // Actually session.getFreeGamesNum() becoming 0 means it's over.
            console.log("Free games ended.");
            break; 
        }
    }
}

test();
