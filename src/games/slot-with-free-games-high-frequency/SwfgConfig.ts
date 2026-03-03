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
        
        // Keep these perfect reel distributions
        const sequences = [];
        const reelDistributions = [
            { Nine: 15, Ten: 14, Jack: 10, Queen: 6, King: 3, Ace: 2, W: 2, S: 1 },
            { Nine: 14, Ten: 13, Jack: 9, Queen: 6, King: 3, Ace: 2, W: 2, S: 1 },
            { Nine: 13, Ten: 12, Jack: 9, Queen: 7, King: 4, Ace: 2, W: 3, S: 2 },
            { Nine: 12, Ten: 11, Jack: 9, Queen: 7, King: 4, Ace: 3, W: 3, S: 1 },
            { Nine: 11, Ten: 10, Jack: 8, Queen: 8, King: 5, Ace: 4, W: 4, S: 1 }
        ];
        
        for (let i = 0; i < this.getReelsNumber(); i++) {
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols(reelDistributions[i]);
            sequence.shuffle();
            
            for (let j = 0; j < sequence.getSize(); j++) {
                const symbols = sequence.getSymbols(j, this.getReelsSymbolsNumber());
                const scatters = symbols.filter((symbol) => symbol === "S");
                if (scatters.length > 2) {
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
        
        // FINAL ADJUSTMENT: Reduce all payouts by 3%
        this.getAvailableSymbols()
            .filter((symbol) => !this.isSymbolWild(symbol))
            .forEach((symbol) => {
                switch(symbol){
                    case "Nine":
                        pt.setPayoutForSymbol(symbol, 3, 0.33);  // Down from 0.34
                        pt.setPayoutForSymbol(symbol, 4, 0.85);  // Down from 0.87
                        pt.setPayoutForSymbol(symbol, 5, 1.71);  // Down from 1.75
                        break;

                    case "Ten":
                        pt.setPayoutForSymbol(symbol, 3, 0.33);  // Down from 0.34
                        pt.setPayoutForSymbol(symbol, 4, 0.85);  // Down from 0.87
                        pt.setPayoutForSymbol(symbol, 5, 1.71);  // Down from 1.75
                        break;

                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 0.67);  // Down from 0.68
                        pt.setPayoutForSymbol(symbol, 4, 1.33);  // Down from 1.36
                        pt.setPayoutForSymbol(symbol, 5, 2.67);  // Down from 2.72
                        break;
                        
                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 0.87);  // Down from 0.9
                        pt.setPayoutForSymbol(symbol, 4, 1.94);  // Down from 2.0
                        pt.setPayoutForSymbol(symbol, 5, 3.40);  // Down from 3.5
                        break;

                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 1.36);  // Down from 1.4
                        pt.setPayoutForSymbol(symbol, 4, 3.10);  // Down from 3.2
                        pt.setPayoutForSymbol(symbol, 5, 6.30);  // Down from 6.5
                        break;
                    
                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 1.94);  // Down from 2.0
                        pt.setPayoutForSymbol(symbol, 4, 4.85);  // Down from 5.0
                        pt.setPayoutForSymbol(symbol, 5, 9.70);  // Down from 10.0
                        break;
                    
                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 1.75);  // Down from 1.8
                        pt.setPayoutForSymbol(symbol, 4, 8.73);  // Down from 9.0
                        pt.setPayoutForSymbol(symbol, 5, 33.95); // Down from 35.0
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