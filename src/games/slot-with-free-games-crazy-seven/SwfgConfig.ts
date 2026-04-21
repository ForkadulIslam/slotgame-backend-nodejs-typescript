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
        console.log('Crazy Seven config')
        super();
        this.setReelsNumber(5);
        this.setReelsSymbolsNumber(4);

        this.setAvailableSymbols(["Filler", "Ace", "King", "Queen", "Jack", "Diamond", "Spade", "W", "S"]);
        this.setWildSymbols(["W"]);
        this.setScatterSymbols(["S"]);
        const sequences = [];
        for (let i = 0; i < this.getReelsNumber(); i++) {
            
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols({
                Filler: 100,
                Spade: 80,    
                Diamond: 70,    
                Jack: 50,   
                Queen: 45,   
                King: 35,
                Ace: 55,
                W: 20,
                S: 20,
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
                pt.setPayoutForSymbol(symbol, 3, 0);
                pt.setPayoutForSymbol(symbol, 4, 0);
                pt.setPayoutForSymbol(symbol, 5, 0);

                switch(symbol){

                    case "Spade":
                        pt.setPayoutForSymbol(symbol, 3, 0.2); 
                        pt.setPayoutForSymbol(symbol, 4, 1.0);
                        pt.setPayoutForSymbol(symbol, 5, 5.0);
                        break;
                    case "Diamond":
                        pt.setPayoutForSymbol(symbol, 3, 0.5); 
                        pt.setPayoutForSymbol(symbol, 4, 2.0);
                        pt.setPayoutForSymbol(symbol, 5, 10.0);
                        break;
                    case "Jack":
                        pt.setPayoutForSymbol(symbol, 3, 1.0); // RESTORED
                        pt.setPayoutForSymbol(symbol, 4, 5.0);
                        pt.setPayoutForSymbol(symbol, 5, 20.0);
                        break;
                    case "Queen":
                        pt.setPayoutForSymbol(symbol, 3, 2.0); // RESTORED
                        pt.setPayoutForSymbol(symbol, 4, 10.0); 
                        pt.setPayoutForSymbol(symbol, 5, 100.0);
                        break;
                    case "King":
                        pt.setPayoutForSymbol(symbol, 3, 5.0); // RESTORED
                        pt.setPayoutForSymbol(symbol, 4, 20.0);
                        pt.setPayoutForSymbol(symbol, 5, 250.0);
                        break;
                    case "Ace":
                        pt.setPayoutForSymbol(symbol, 3, 10.0); // HIGH VALUE
                        pt.setPayoutForSymbol(symbol, 4, 50.0); 
                        pt.setPayoutForSymbol(symbol, 5, 200.0); // x10 = 2,000x
                        break;
                    case "S":
                        pt.setPayoutForSymbol(symbol, 3, 2.0);
                        pt.setPayoutForSymbol(symbol, 4, 10.0);
                        pt.setPayoutForSymbol(symbol, 5, 50.0);
                        break;

                    case "Filler":
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
                newSeq.removeAllSymbols("Spade");
                newSeq.removeAllSymbols("Diamond");
                
                // VOLATILITY BOOST: Add extra Aces in Free Games
                newSeq.addSymbol("Ace", 60); 
                newSeq.addSymbol("Filler", 150); // Balance the "Anywhere Pays" logic
                
                newSeq.shuffle();
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
