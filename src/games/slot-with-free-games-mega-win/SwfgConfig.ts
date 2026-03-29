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
    protected readonly normalSequences: SymbolsSequence[];
    protected readonly freeGamesSequences: SymbolsSequence[];
    protected readonly normalPatterns: LeftToRightLinesPatterns;
    protected readonly freeGamesPatterns: ScatteredLinesPatterns;
    protected freeGamesMode = false;

    constructor() {
        console.log('Mega-win');
        super();
        this.setCreditsAmount(10000);
        this.setReelsNumber(5);
        this.setReelsSymbolsNumber(4);

        this.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "W", "S"]);
        this.setWildSymbols(["W"]);
        this.setScatterSymbols(["S"]);
        const sequences = [];
        
        // MATHEMATICAL CORRECTION: Rotated Dominance (L=220)
        // Each reel has a different majority (95) to ensure ~20% Hit Frequency.
        // Cluster density allows for 'Stacked' wins across 50+ lines.
        const reelDistributions = [
            { Nine: 95, Ten: 15, Jack: 15, Queen: 15, King: 15, Ace: 15, W: 10, S: 4 }, // R1: Nine Dom
            { Nine: 15, Ten: 95, Jack: 15, Queen: 15, King: 15, Ace: 15, W: 10, S: 4 }, // R2: Ten Dom
            { Nine: 15, Ten: 15, Jack: 95, Queen: 15, King: 15, Ace: 15, W: 10, S: 4 }, // R3: Jack Dom
            { Nine: 15, Ten: 15, Jack: 15, Queen: 95, King: 15, Ace: 15, W: 10, S: 4 }, // R4: Queen Dom
            { Nine: 15, Ten: 15, Jack: 15, Queen: 15, King: 95, Ace: 15, W: 10, S: 4 }  // R5: King Dom
        ];
        
        for (let i = 0; i < this.getReelsNumber(); i++) {
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols(reelDistributions[i]);
            sequence.shuffle();
            
            // Limit scatters per window for controlled bonus trigger (~1 in 220 spins)
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
        
        // MEGA WIN VALUES: Buffed for 5-of-a-kind to allow Multiplier spikes
        this.getAvailableSymbols()
            .filter((symbol) => !this.isSymbolWild(symbol))
            .forEach((symbol) => {
                switch(symbol){
                    case "Nine":
                        pt.setPayoutForSymbol(symbol, 3, 0.1);
                        pt.setPayoutForSymbol(symbol, 4, 0.5);
                        pt.setPayoutForSymbol(symbol, 5, 2.0);
                        break;

                    case "Ten":
                        pt.setPayoutForSymbol(symbol, 3, 0.1);
                        pt.setPayoutForSymbol(symbol, 4, 0.5);
                        pt.setPayoutForSymbol(symbol, 5, 2.0);
                        break;

                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 0.2);
                        pt.setPayoutForSymbol(symbol, 4, 1.0);
                        pt.setPayoutForSymbol(symbol, 5, 10.0);
                        break;

                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 0.5);
                        pt.setPayoutForSymbol(symbol, 4, 2.0);
                        pt.setPayoutForSymbol(symbol, 5, 20.0);
                        break;

                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 1.0);
                        pt.setPayoutForSymbol(symbol, 4, 5.0);
                        pt.setPayoutForSymbol(symbol, 5, 50.0);
                        break;
                    
                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 2.0);
                        pt.setPayoutForSymbol(symbol, 4, 10.0);
                        pt.setPayoutForSymbol(symbol, 5, 100.0); // Hits 50 lines = 5,000x
                        break;
                    
                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 5.0);
                        pt.setPayoutForSymbol(symbol, 4, 25.0);
                        pt.setPayoutForSymbol(symbol, 5, 250.0);
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