import dotenv from 'dotenv';
dotenv.config();
import * as Classic from "./slot-with-free-games-classic/index.js";
import * as HighFrequency from "./slot-with-free-games-high-frequency/index.js";
import * as MegaWin from "./slot-with-free-games-mega-win/index.js";

export const gameRegistry: Record<string, any> = {
    "classic": Classic,
    "high-frequency": HighFrequency,
    "mega-win": MegaWin,
};

// Default types for convenience, though we'll use registry dynamically
export const {
    SwfgConfig,
    SwfgSession,
    SwfgSessionWinCalculator,
} = Classic;
