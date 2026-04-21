import {SwfgConfig} from "./SwfgConfig.js";
import {
    SymbolsCombinationDescribing,
    VideoSlotWinCalculator,
    WinningLine,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
} from "pokie";

export class SwfgSessionWinCalculator extends VideoSlotWinCalculator {
    private swfgConfig: SwfgConfig;
    private multipliedLines?: Record<string, WinningLineDescribing>;
    private multipliedScatters?: Record<string, WinningScatterDescribing>;

    constructor(config: SwfgConfig) {
        super(config);
        this.swfgConfig = config;
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing) {
        super.calculateWin(bet, symbolsCombination);
        if (this.swfgConfig.isFreeGamesMode()) {
            const multiplier = 10; // THE CRAZY MULTIPLIER
            const originalScatters = super.getWinningScatters();
            this.multipliedScatters = {};
            Object.values(originalScatters).forEach(
                (scatter) =>
                    (this.multipliedScatters![scatter.getSymbolId()] = new WinningScatter(
                        scatter.getSymbolId(),
                        scatter.getSymbolsPositions(),
                        scatter.getWinAmount() * multiplier,
                    )),
            );
            const originalLines = super.getWinningLines();
            this.multipliedLines = {};
            Object.values(originalLines).forEach(
                (line) =>
                    (this.multipliedLines![line.getLineId()] = new WinningLine(
                        line.getWinAmount() * multiplier,
                        line.getDefinition(),
                        line.getPattern(),
                        line.getLineId(),
                        line.getSymbolsPositions(),
                        line.getWildSymbolsPositions(),
                        line.getSymbolId(),
                    )),
            );
        } else {
            this.multipliedScatters = undefined;
            this.multipliedLines = undefined;
        }
    }

    public getWinningLines(): Record<string, WinningLineDescribing> {
        return this.multipliedLines ? this.multipliedLines : super.getWinningLines();
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.multipliedScatters ? this.multipliedScatters : super.getWinningScatters();
    }
}
