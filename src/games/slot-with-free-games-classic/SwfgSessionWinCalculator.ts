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

        const originalLines = super.getWinningLines();
        const originalScatters = super.getWinningScatters();

        //console.log()
        if (this.swfgConfig.isFreeGamesMode()) {
            this.multipliedScatters = {};
            Object.values(originalScatters).forEach(
                (scatter) =>
                    (this.multipliedScatters![scatter.getSymbolId()] = new WinningScatter(
                        scatter.getSymbolId(),
                        scatter.getSymbolsPositions(),
                        scatter.getWinAmount() * 2, // Fixed x2 for Scatters in Free Games
                    )),
            );
            this.multipliedLines = {};
            let currentFreeGameMultiplier = 1;
            const maxFreeGameMultiplier = 10;
            Object.values(originalLines).forEach((line) =>{
                const finalWin = Math.round((line.getWinAmount() * currentFreeGameMultiplier) * 100) / 100;
                this.multipliedLines![line.getLineId()] = new WinningLine(
                    finalWin,
                    line.getDefinition(),
                    line.getPattern(),
                    line.getLineId(),
                    line.getSymbolsPositions(),
                    line.getWildSymbolsPositions(),
                    line.getSymbolId(),
                )
                if (currentFreeGameMultiplier < maxFreeGameMultiplier) currentFreeGameMultiplier++;
            });
        } else {
            this.multipliedScatters = undefined;
            this.multipliedLines = {};
            let currentMultiplier = 1;
            const maxBaseMultiplier = 5;
            Object.values(originalLines).forEach((line) =>{

                const finalWin = Math.round((line.getWinAmount() * currentMultiplier) * 100) / 100;
                this.multipliedLines![line.getLineId()] = new WinningLine(
                    finalWin,
                    line.getDefinition(),
                    line.getPattern(),
                    line.getLineId(),
                    line.getSymbolsPositions(),
                    line.getWildSymbolsPositions(),
                    line.getSymbolId(),
                )
                if (currentMultiplier < maxBaseMultiplier) currentMultiplier++;
            });
        }
    }

    public getWinningLines(): Record<string, WinningLineDescribing> {
        return this.multipliedLines ? this.multipliedLines : super.getWinningLines();
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.multipliedScatters ? this.multipliedScatters : super.getWinningScatters();
    }
}
