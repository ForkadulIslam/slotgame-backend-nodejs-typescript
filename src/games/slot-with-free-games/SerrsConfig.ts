import {
    CustomLinesDefinitions,
    LinesDefinitionsFor5x4,
    Paytable,
    SymbolsSequence,
    LeftToRightLinesPatterns,
    LinesPatternsDescribing,
    SymbolsSequenceDescribing,
} from "pokie";
import { SwfgConfig } from "./SwfgConfig.js";

export class SerrsConfig extends SwfgConfig {

    private readonly constructedSequences: SymbolsSequence[];
    private readonly constructedLinesPatterns: LeftToRightLinesPatterns;

    constructor() {
        super();

        this.setReelsNumber(5);
        this.setReelsSymbolsNumber(4);
        this.setAvailableBets([1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 50]);
        this.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "Wild", "Scatter1", "Scatter2"]);
        this.setWildSymbols(["Wild"]);
        this.setScatterSymbols(["Scatter1", "Scatter2"]);
        this.setCreditsAmount(1000);

        const defaultLinesDefinitions = new LinesDefinitionsFor5x4();
        const customLinesDefinitions = new CustomLinesDefinitions();
        customLinesDefinitions.setLineDefinition("0", defaultLinesDefinitions.getLineDefinition("0"));
        customLinesDefinitions.setLineDefinition("1", defaultLinesDefinitions.getLineDefinition("1"));
        customLinesDefinitions.setLineDefinition("2", defaultLinesDefinitions.getLineDefinition("2"));
        customLinesDefinitions.setLineDefinition("3", defaultLinesDefinitions.getLineDefinition("3"));
        customLinesDefinitions.setLineDefinition("4", defaultLinesDefinitions.getLineDefinition("4"));
        customLinesDefinitions.setLineDefinition("5", defaultLinesDefinitions.getLineDefinition("5"));
        customLinesDefinitions.setLineDefinition("6", defaultLinesDefinitions.getLineDefinition("6"));
        customLinesDefinitions.setLineDefinition("7", defaultLinesDefinitions.getLineDefinition("7"));
        customLinesDefinitions.setLineDefinition("8", defaultLinesDefinitions.getLineDefinition("8"));
        customLinesDefinitions.setLineDefinition("9", defaultLinesDefinitions.getLineDefinition("9"));
        customLinesDefinitions.setLineDefinition("10", defaultLinesDefinitions.getLineDefinition("10"));
        customLinesDefinitions.setLineDefinition("11", defaultLinesDefinitions.getLineDefinition("11"));
        customLinesDefinitions.setLineDefinition("12", [0, 1, 0, 1, 0]);
        customLinesDefinitions.setLineDefinition("13", [1, 2, 1, 2, 1]);
        customLinesDefinitions.setLineDefinition("14", [2, 3, 2, 3, 2]);
        customLinesDefinitions.setLineDefinition("15", [1, 0, 1, 0, 1]);
        customLinesDefinitions.setLineDefinition("16", [2, 1, 2, 1, 2]);
        customLinesDefinitions.setLineDefinition("17", [3, 2, 3, 2, 3]);
        customLinesDefinitions.setLineDefinition("18", [0, 1, 2, 3, 2]);
        customLinesDefinitions.setLineDefinition("19", [3, 2, 1, 0, 1]);
        customLinesDefinitions.setLineDefinition("20", [0, 2, 0, 2, 0]);
        customLinesDefinitions.setLineDefinition("21", [1, 3, 1, 3, 1]);
        customLinesDefinitions.setLineDefinition("22", [1, 0, 0, 0, 1]);
        customLinesDefinitions.setLineDefinition("23", [2, 3, 3, 3, 2]);
        customLinesDefinitions.setLineDefinition("24", [0, 2, 1, 2, 0]);
        this.setLinesDefinitions(customLinesDefinitions);

        this.constructedLinesPatterns = new LeftToRightLinesPatterns(this.getReelsNumber());

        const sequences: SymbolsSequence[] = [];
        for (let i = 0; i < this.getReelsNumber(); i++) {
            const sequence = new SymbolsSequence();
            sequence.fromNumbersOfSymbols({
                Nine: 4, Ten: 3, Jack: 5, Queen: 5, King: 4, Ace: 3, Wild: 2, Scatter1: 2,
            });
            sequence.shuffle();
            for (let j = 0; j < sequence.getSize(); j++) {
                const symbols = sequence.getSymbols(j, this.getReelsSymbolsNumber());
                const scatters = symbols.filter((symbol) => symbol === "Scatter1");
                if (scatters.length > 1) {
                    sequence.shuffle();
                    j = 0;
                }
            }
            sequences.push(sequence);
        }
        sequences[1].addSymbol("Scatter2", this.getReelsSymbolsNumber(), Math.floor(sequences[1].getSize() / 2));
        sequences[2].addSymbol("Scatter2", this.getReelsSymbolsNumber(), Math.floor(sequences[2].getSize() / 2));
        sequences[3].addSymbol("Scatter2", this.getReelsSymbolsNumber(), Math.floor(sequences[3].getSize() / 2));
        sequences[1].addSymbol("Scatter2", this.getReelsSymbolsNumber());
        sequences[2].addSymbol("Scatter2", this.getReelsSymbolsNumber());
        sequences[3].addSymbol("Scatter2", this.getReelsSymbolsNumber());
        this.constructedSequences = sequences;

        const paytable = new Paytable(this.getAvailableBets());
        paytable.setPayoutForSymbol("Nine", 3, 0.2);
        paytable.setPayoutForSymbol("Nine", 4, 0.4);
        paytable.setPayoutForSymbol("Nine", 5, 0.8);
        paytable.setPayoutForSymbol("Ten", 3, 0.2);
        paytable.setPayoutForSymbol("Ten", 4, 0.4);
        paytable.setPayoutForSymbol("Ten", 5, 0.8);
        paytable.setPayoutForSymbol("Jack", 3, 0.4);
        paytable.setPayoutForSymbol("Jack", 4, 0.8);
        paytable.setPayoutForSymbol("Jack", 5, 1.5);
        paytable.setPayoutForSymbol("Queen", 3, 0.4);
        paytable.setPayoutForSymbol("Queen", 4, 0.8);
        paytable.setPayoutForSymbol("Queen", 5, 1.5);
        paytable.setPayoutForSymbol("King", 3, 0.8);
        paytable.setPayoutForSymbol("King", 4, 1.5);
        paytable.setPayoutForSymbol("King", 5, 3);
        paytable.setPayoutForSymbol("Ace", 3, 1);
        paytable.setPayoutForSymbol("Ace", 4, 2);
        paytable.setPayoutForSymbol("Ace", 5, 4);
        paytable.setPayoutForSymbol("Scatter1", 3, 2);
        paytable.setPayoutForSymbol("Scatter1", 4, 5);
        paytable.setPayoutForSymbol("Scatter1", 5, 10);
        this.setPaytable(paytable);
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.constructedSequences;
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.constructedLinesPatterns;
    }

    public setFreeGamesMode(value: boolean): void {
        // This game has no free games mode.
    }

    public isFreeGamesMode(): boolean {
        return false;
    }
}
