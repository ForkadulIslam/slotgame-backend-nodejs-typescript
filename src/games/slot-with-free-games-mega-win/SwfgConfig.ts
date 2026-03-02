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
        
        // GOLDILOCKS ZONE: Not too hot, not too cold
        const reelDistributions = [
            { Nine: 22, Ten: 20, Jack: 16, Queen: 14, King: 10, Ace: 8, W: 5, S: 1 },  // Reel 1: 1 scatter
            { Nine: 20, Ten: 18, Jack: 15, Queen: 13, King: 11, Ace: 9, W: 5, S: 2 },  // Reel 2: 2 scatters
            { Nine: 18, Ten: 16, Jack: 14, Queen: 12, King: 12, Ace: 10, W: 5, S: 2 }, // Reel 3: 2 scatters
            { Nine: 16, Ten: 14, Jack: 13, Queen: 11, King: 13, Ace: 11, W: 5, S: 2 }, // Reel 4: 2 scatters
            { Nine: 14, Ten: 12, Jack: 12, Queen: 10, King: 14, Ace: 12, W: 5, S: 1 }  // Reel 5: 1 scatter
        ];
        // Total scatters: 8 (compared to 11 in hot config, 5 in cold config)
        
        for (let i = 0; i < this.getReelsNumber(); i++) {
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols(reelDistributions[i]);
            sequence.shuffle();
            
            // CRITICAL: Change validation to >1 for better control
            for (let j = 0; j < sequence.getSize(); j++) {
                const symbols = sequence.getSymbols(j, this.getReelsSymbolsNumber());
                const scatters = symbols.filter((symbol) => symbol === "S");
                if (scatters.length > 1) { // Changed back to >1 for stability
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
        
        // REDUCED PAYOUTS: Lower than hot config, higher than cold
        this.getAvailableSymbols()
            .filter((symbol) => !this.isSymbolWild(symbol))
            .forEach((symbol) => {
                switch(symbol){
                    case "Nine":
                        pt.setPayoutForSymbol(symbol, 3, 0.35);
                        pt.setPayoutForSymbol(symbol, 4, 0.7);
                        pt.setPayoutForSymbol(symbol, 5, 1.4);
                        break;

                    case "Ten":
                        pt.setPayoutForSymbol(symbol, 3, 0.35);
                        pt.setPayoutForSymbol(symbol, 4, 0.7);
                        pt.setPayoutForSymbol(symbol, 5, 1.4);
                        break;

                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 0.7);
                        pt.setPayoutForSymbol(symbol, 4, 1.4);
                        pt.setPayoutForSymbol(symbol, 5, 2.8);
                        break;

                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 0.9);
                        pt.setPayoutForSymbol(symbol, 4, 2.0);
                        pt.setPayoutForSymbol(symbol, 5, 4.0);
                        break;

                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 1.4);
                        pt.setPayoutForSymbol(symbol, 4, 3.5);
                        pt.setPayoutForSymbol(symbol, 5, 14.0);
                        break;
                    
                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 2.1);
                        pt.setPayoutForSymbol(symbol, 4, 5.6);
                        pt.setPayoutForSymbol(symbol, 5, 24.0);
                        break;
                    
                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 2.1);
                        pt.setPayoutForSymbol(symbol, 4, 10.5);
                        pt.setPayoutForSymbol(symbol, 5, 100.0);
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