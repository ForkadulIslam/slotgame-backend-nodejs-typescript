import { VideoSlotWithFreeGamesSessionSerializer, VideoSlotWithFreeGamesSession, SymbolsCombinationsGenerator, VideoSlotWithFreeGamesConfig, VideoSlotWinCalculator } from "pokie";

const config = new VideoSlotWithFreeGamesConfig();
config.setReelsNumber(5);
config.setReelsSymbolsNumber(4);
config.setAvailableSymbols(["A", "K", "Q", "J", "10", "9", "W", "S"]);
config.setWildSymbols(["W"]);
config.setScatterSymbols(["S"]);

const generator = new SymbolsCombinationsGenerator(config);
const calculator = new VideoSlotWinCalculator(config);
const session = new VideoSlotWithFreeGamesSession(config, generator, calculator);
const serializer = new VideoSlotWithFreeGamesSessionSerializer();

session.setCreditsAmount(1234.56);
session.play();

const serialized = serializer.serialize(session);
console.log("---SERIALIZED_START---");
console.log(serialized);
console.log("---SERIALIZED_END---");
console.log("Length:", serialized.length);
