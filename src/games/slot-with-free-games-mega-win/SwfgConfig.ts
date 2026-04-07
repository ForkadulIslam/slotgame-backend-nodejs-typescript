import {
    CustomLinesDefinitions,
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
        console.log('Megawin config')
        super();
        this.setReelsNumber(5);
        this.setReelsSymbolsNumber(4);

        this.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "W", "S", "F"]);
        this.setWildSymbols(["W"]);
        this.setScatterSymbols(["S"]);
        const sequences = [];
        for (let i = 0; i < this.getReelsNumber(); i++) {
            
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols({
                Nine: 45,
                Ten: 38,
                Jack: 32,
                Queen: 25,
                King: 22,
                Ace: 15,
                W: 3,
                S: 5,
                F: 16,
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

                // First, ensure all possible hits are 0
                pt.setPayoutForSymbol(symbol, 2, 0);
                pt.setPayoutForSymbol(symbol, 3, 0);
                pt.setPayoutForSymbol(symbol, 4, 0);
                pt.setPayoutForSymbol(symbol, 5, 0);

                switch(symbol){


                    case "F":  // Filler symbol - NO PAYOUTS
                    // All payouts remain 0
                    break;

                    case "Nine":
                        pt.setPayoutForSymbol(symbol, 3, 0.08);
                        pt.setPayoutForSymbol(symbol, 4, 0.35);
                        pt.setPayoutForSymbol(symbol, 5, 1.2);
                        break;

                    case "Ten":
                        pt.setPayoutForSymbol(symbol, 3, 0.11);
                        pt.setPayoutForSymbol(symbol, 4, 0.45);
                        pt.setPayoutForSymbol(symbol, 5, 2.1);
                        break;

                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 0.2);
                        pt.setPayoutForSymbol(symbol, 4, 0.9);
                        pt.setPayoutForSymbol(symbol, 5, 7.5);
                        break;

                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 0.4);
                        pt.setPayoutForSymbol(symbol, 4, 2.0);
                        pt.setPayoutForSymbol(symbol, 5, 22.0);
                        break;

                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 0.7);
                        pt.setPayoutForSymbol(symbol, 4, 7.0);
                        pt.setPayoutForSymbol(symbol, 5, 160.0);
                        break;

                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 3.5);    // Up from 2.8
                        pt.setPayoutForSymbol(symbol, 4, 75.0);   // Up from 60.0
                        pt.setPayoutForSymbol(symbol, 5, 2000.0); // Keep
                        break;

                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 2.5);
                        pt.setPayoutForSymbol(symbol, 4, 22.0);
                        pt.setPayoutForSymbol(symbol, 5, 250.0);
                        break;

                }
            });
        this.setPaytable(pt);

        this.normalPatterns = new LeftToRightLinesPatterns(this.getReelsNumber(), 3);

        this.freeGamesPatterns = new ScatteredLinesPatterns(this.getReelsNumber(), 3);

        //this.setLinesDefinitions(new LinesDefinitionsFor5x4());
        const allLines = new LinesDefinitionsFor5x4();
        const tenLines = new CustomLinesDefinitions();
        for (let i = 0; i < 10; i++) {
            tenLines.setLineDefinition(i.toString(), allLines.getLineDefinition(i.toString()));
        }
        this.setLinesDefinitions(tenLines);


        this.normalSequences = super
            .getSymbolsSequences()
            .map((sequence) => new SymbolsSequence().fromArray(sequence.toArray()));
        this.freeGamesSequences = super
            .getSymbolsSequences()
            .map((sequence) =>{
                const newSeq = new SymbolsSequence().fromArray(sequence.toArray());
                newSeq.removeAllSymbols(this.getScatterSymbols()[0]);
                return newSeq;
            });       
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
