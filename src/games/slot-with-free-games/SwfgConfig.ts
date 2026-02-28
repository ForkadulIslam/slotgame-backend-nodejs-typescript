import {
    LeftToRightLinesPatterns,
    LinesDefinitionsFor5x4,
    LinesPatternsDescribing,
    Paytable,
    ScatteredLinesPatterns,
    SymbolsSequence,
    SymbolsSequenceDescribing,
    VideoSlotWithFreeGamesConfig,
} from "pokie";

export class SwfgConfig extends VideoSlotWithFreeGamesConfig {
    private readonly normalSequences: SymbolsSequence[];
    private readonly freeGamesSequences: SymbolsSequence[];
    private readonly normalPatterns: LeftToRightLinesPatterns;
    private readonly freeGamesPatterns: ScatteredLinesPatterns;
    private freeGamesMode = false;

    constructor() {
        super();
        this.setCreditsAmount(10000);
        this.setReelsNumber(5);
        this.setReelsSymbolsNumber(4);

        this.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "W", "S"]);
        this.setWildSymbols(["W"]);
        this.setScatterSymbols(["S"]);
        const sequences = [];
        for (let i = 0; i < this.getReelsNumber(); i++) {
            
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols({
                Nine: 22,
                Ten: 20,
                Jack: 16,
                Queen: 14,
                King: 10,
                Ace: 6,
                W: 5,
                S: 2,
            });
            sequence.shuffle();
            for (let j = 0; j < sequence.getSize(); j++) {
                const symbols = sequence.getSymbols(j, this.getReelsSymbolsNumber());
                const scatters = symbols.filter((symbol) => symbol === "S");
                if (scatters.length > 1) {
                    sequence.shuffle();
                    j = 0;
                }
            }
            sequences.push(sequence);
        }
        this.setSymbolsSequences(sequences);
        

        const pt = new Paytable(
            this.getAvailableBets(),
            this.getAvailableSymbols(),
            this.getWildSymbols(),
            this.getReelsNumber(),
        );
        this.getAvailableSymbols()
            .filter((symbol) => !this.isSymbolWild(symbol))
            .forEach((symbol) => {
                switch(symbol){

                    case "Nine":
                        pt.setPayoutForSymbol(symbol, 3, 0.4);
                        pt.setPayoutForSymbol(symbol, 4, 0.8);
                        pt.setPayoutForSymbol(symbol, 5, 0.8);
                        break;

                    case "Ten":
                        pt.setPayoutForSymbol(symbol, 3, 0.4);
                        pt.setPayoutForSymbol(symbol, 4, 0.8);
                        pt.setPayoutForSymbol(symbol, 5, 0.8);
                        break;

                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 0.8);
                        pt.setPayoutForSymbol(symbol, 4, 1.2);
                        pt.setPayoutForSymbol(symbol, 5, 1.5);
                        break;

                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 0.8);
                        pt.setPayoutForSymbol(symbol, 4, 1.8);
                        pt.setPayoutForSymbol(symbol, 5, 2.5);
                        break;

                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 1.2);
                        pt.setPayoutForSymbol(symbol, 4, 3.5);
                        pt.setPayoutForSymbol(symbol, 5, 7);
                        break;
                    
                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 2);
                        pt.setPayoutForSymbol(symbol, 4, 5);
                        pt.setPayoutForSymbol(symbol, 5, 10);
                        break;
                    
                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 2);
                        pt.setPayoutForSymbol(symbol, 4, 10);
                        pt.setPayoutForSymbol(symbol, 5, 50);
                        break;
                }
            });
        this.setPaytable(pt);

        this.normalPatterns = new LeftToRightLinesPatterns(this.getReelsNumber(), 3);

        this.freeGamesPatterns = new ScatteredLinesPatterns(this.getReelsNumber(), 3);

        this.setLinesDefinitions(new LinesDefinitionsFor5x4());
        this.normalSequences = super
            .getSymbolsSequences()
            .map((sequence) => new SymbolsSequence().fromArray(sequence.toArray()));
        this.freeGamesSequences = super
            .getSymbolsSequences()
            .map((sequence) =>
                new SymbolsSequence().fromArray(sequence.toArray()).removeAllSymbols(this.getScatterSymbols()[0]),
            );       
    }

    public setFreeGamesMode(value: boolean): void {
        this.freeGamesMode = value;
    }

    public isFreeGamesMode(): boolean {
        return this.freeGamesMode;
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        if (this.freeGamesMode) {
            return this.freeGamesSequences;
        } else {
            return this.normalSequences;
        }
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        if (this.freeGamesMode) {
            return this.freeGamesPatterns;
        } else {
            return this.normalPatterns;
        }
    }
}
