import {SymbolsCombinationsGenerating, VideoSlotWinCalculating, VideoSlotWithFreeGamesSession} from "pokie";
import {SwfgConfig} from "./SwfgConfig.js";

export class SwfgSession extends VideoSlotWithFreeGamesSession {
    private swfgConfig: SwfgConfig;

    constructor(
        config: SwfgConfig,
        combinationsGenerator: SymbolsCombinationsGenerating,
        winCalculator: VideoSlotWinCalculating,
    ) {
        super(config, combinationsGenerator, winCalculator);
        this.swfgConfig = config;
    }

    public play() {
        super.play();
        if (this.getFreeGamesSum() > 0 && this.getFreeGamesNum() !== this.getFreeGamesSum()) {
            this.swfgConfig.setFreeGamesMode(true);
        } else {
            this.swfgConfig.setFreeGamesMode(false);
        }
        console.log(`[CORE-LOG] Session Instance Sum: ${this.getFreeGamesSum()}, Instance Config Mode: ${this.swfgConfig.isFreeGamesMode()}`);
    }
}
