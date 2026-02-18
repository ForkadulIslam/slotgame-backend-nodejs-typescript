/*
This is an example of a simple 5x4 video slot game with 8 winning lines.

Features:
- A line of minimum 3 winning symbols pays out.

- "Wild" is a wild symbol that substitutes any other symbol on a winning line.

- "Scatter1" is a scatter symbol that pays out 10x, 20x, or 30x the bet if 3 or more symbols
  appear on any positions. Only one "Scatter1" can appear on any reel.

- "Scatter2" is a stacked scatter symbol that can appear on the 3 middle reels.
  If all 3 middle reels are covered with "Scatter2" symbols, the game pays 100x the bet.
*/
import { 
  CustomLinesDefinitions, 
  LinesDefinitionsFor5x4, 
  Paytable,  
  SymbolsSequence, 
  VideoSlotConfig, 
  VideoSlotSession, 
  VideoSlotSessionSerializer,
  SimulationConfig,
  Simulation,
  LeftToRightLinesPatterns
} from "pokie";
/*
Let's create the game configuration.
We can define the bounds of the reels matrix, a list of available bets in the game,
and a list of all available symbols. We also need to define which symbols are wilds and scatters.
*/
const config = new VideoSlotConfig();
config.setReelsNumber(5);
config.setReelsSymbolsNumber(4);
config.setAvailableBets([1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 50]);
config.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "Wild", "Scatter1", "Scatter2"]);
config.setWildSymbols(["Wild"]);
config.setScatterSymbols(["Scatter1", "Scatter2"]);
/*
There are several default classes representing lines definitions.
Let's use the one for 5x4 reels as the base.
*/
const defaultLinesDefinitions = new LinesDefinitionsFor5x4();
/*
We want to use only first 8 lines from the default definitions.
Let's copy them to our own custom definitions object and put it into the game config.
*/
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


config.setLinesDefinitions(customLinesDefinitions);
//console.log(config.getLinesDefinitions());

/*
Lines patterns define the direction of how the winning symbols are counted on the winning line.
In our case, lines should count from left to right.
*/
const linesPatterns = new LeftToRightLinesPatterns(config.getReelsNumber());
config.setLinesPatterns(linesPatterns);
/*
Symbols sequences (also known as reels strips) are the long lists with all possible symbols combinations in the game.
When the round outcome combination is generated, the symbols are retrieved from these sequences.

Let's create an empty array where we will put the sequences for every reel and iterate over the number of reels.
*/
const sequences = [];
for (let i = 0; i < config.getReelsNumber(); i++) {
    /*
    Create a single sequence for the current reel. The sequence is empty by default.
     */
    const sequence = new SymbolsSequence();

    /*
    There are several ways of initializing the sequence with symbols.
    Here we will initialize it by defining a map of the number of each symbol on the sequence.
    Let's say we want to have 5 symbols "Nines" and "Tens", 4 "Jacks" and "Queens", 3 "Kings", 2 "Aces", 5 "Wilds",
    and only 1 "Scatter1".
     */
    sequence.fromNumbersOfSymbols({
        Nine: 4,
        Ten: 3,
        Jack: 5,
        Queen: 5,
        King: 4,
        Ace: 3,
        Wild: 2,
        Scatter1: 2,
        //Scatter2: 1,
    });





    
    /*
    The sequence we've just created will contain the stacks of the size of the number of every symbol we've provided.
    We need to shuffle it to have symbols distributed randomly on the sequence.
     */
    sequence.shuffle();

    /*
    Since we want to have only 1 "Scatter1" symbol on every reel during play, we need to continue shuffling
    the sequence until there are no situations where 2 or more "Scatter1" symbols appear together.
     */
    for (let j = 0; j < sequence.getSize(); j++) {
        const symbols = sequence.getSymbols(j, config.getReelsSymbolsNumber());
        const scatters = symbols.filter((symbol) => symbol === "Scatter1");
        if (scatters.length > 1) {
            sequence.shuffle();
            j = 0;
        }
    }

    /*
    Once we have the properly built sequence, we save it for the current reel.
     */
    sequences.push(sequence);
}


/*
 * Now let's add the stacks of special "Scatter2" symbols.
 * Let's add one stack at the middle of the sequence for each reel.
 */


sequences[1].addSymbol("Scatter2", config.getReelsSymbolsNumber(), Math.floor(sequences[1].getSize() / 2));
sequences[2].addSymbol("Scatter2", config.getReelsSymbolsNumber(), Math.floor(sequences[2].getSize() / 2));
sequences[3].addSymbol("Scatter2", config.getReelsSymbolsNumber(), Math.floor(sequences[3].getSize() / 2));
/*
 * And one more stack at the very end of the sequence so that these stacks will not intersect.
 */
sequences[1].addSymbol("Scatter2", config.getReelsSymbolsNumber());
sequences[2].addSymbol("Scatter2", config.getReelsSymbolsNumber());
sequences[3].addSymbol("Scatter2", config.getReelsSymbolsNumber());




/*
 * Once the sequences are built, we can put them into the config.
 */
config.setSymbolsSequences(sequences);



/*
 * Let's say that the initial balance for the game session should be 10000 credits.
 */
config.setCreditsAmount(1000);
/*
 * Finally, we need to define the paytable for the game.
 * Let's initialize an empty paytable for the list of available bets.
 */
const paytable = new Paytable(config.getAvailableBets());
/*
 * After that, we can specify the payouts for every particular symbol.
 */
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
//paytable.setPayoutForSymbol("Scatter2", 3, 10);
/*
 * Once the paytable is defined, we can put it into the config.
 */
config.setPaytable(paytable);


/*
 * Now everything is done, and the default video slot game session can be created for the config we've just built.
 */
//Simulation code start

const session = new VideoSlotSession(config);
const sessinSerializer =  new VideoSlotSessionSerializer();

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(500);

const simulation = new Simulation(session, simulationConfig);


simulation.beforePlayCallback = () => {
    //console.log("Before play");
};
simulation.afterPlayCallback = () => {
    // const roundData = sessinSerializer.getRoundData(session);

    // if (roundData.winningScatters && Object.values(roundData.winningScatters).length > 0) {
    //     let totalWin = Object.values(roundData.winningScatters).reduce((sum, scatter) => sum + scatter.winAmount, 0);
    //     // console.log("-----Scatter win:" + Object.values(roundData.winningScatters).length, totalWin);
    //     // console.log(roundData.winningScatters);
    // }

};
simulation.onFinishedCallback = () => {
    console.log("Simulation finished");
};
simulation.run();
console.log("Simulation results:");
console.log("RTP: " + simulation.getAverageRtp());
console.log("Average payout: " + simulation.getAveragePayout());
console.log("Payouts standard deviation: " + simulation.getPayoutsStandardDeviation());
console.log("Average payout without non-winning rounds: " + simulation.getAveragePayout(false));
console.log("Payouts standard deviation without non-winning rounds: " + simulation.getPayoutsStandardDeviation(false));
console.log('Hit frequency:'+ simulation.getHitFrequency())
console.log('No of round: '+ simulation.getTotalNumberOfRounds())
console.log('winning round: '+ simulation.getNumberOfWinningRounds())

//simulation Finish



export function createGameSession() {
    // 'config' is the VideoSlotConfig object you already defined in this file
    const newSession = new VideoSlotSession(config);
    const newSerializer = new VideoSlotSessionSerializer();
    newSession.setCreditsAmount(1000); // Set initial credits for the new session
    return { 
      session: newSession, 
      serializer: newSerializer,
      customScenarios:[]
    };
}

