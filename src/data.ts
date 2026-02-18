import {
    PlayUntilAnyWinStrategy,
    PlayUntilSymbolWinStrategy,
    Simulation,
    SimulationConfig,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWithFreeGamesInitialNetworkData,
    VideoSlotWithFreeGamesRoundNetworkData,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
} from "pokie";

export const getInitialData = async (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
): Promise<
    VideoSlotInitialNetworkData | VideoSlotWithFreeGamesInitialNetworkData
> => {
    console.log('getInitialData....')
    return new Promise((res) => {
        res(serializer.getInitialData(session as VideoSlotWithFreeGamesSession));
    });
};

export const getRoundData = async (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
): Promise<VideoSlotRoundNetworkData | VideoSlotWithFreeGamesRoundNetworkData> => {
    return new Promise((res) => {
        session.play();
        res(serializer.getRoundData(session as VideoSlotWithFreeGamesSession));
    });
};

export const getSymbolWinData = async (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
    itemId: string,
    times: number,
) => {
    return new Promise((res) => {
        session.play();
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(Infinity);
        const playStrategy = new PlayUntilSymbolWinStrategy(itemId);
        playStrategy.setExactNumberOfWinningSymbols(times);
        simulationConfig.setPlayStrategy(playStrategy);
        res(runSimulation(session, serializer, simulationConfig));
    });
};

export const getAnyWinData = async (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
) => {
    return new Promise((res) => {
        session.play();
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(Infinity);
        const playStrategy = new PlayUntilAnyWinStrategy();
        simulationConfig.setPlayStrategy(playStrategy);
        res(runSimulation(session, serializer, simulationConfig));
    });
};

export const getCustomScenarioData = async (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
    customScenarios: [string, string, SimulationConfig][],
    scenarioId: string,
) => {
    return new Promise((res) => {
        const simulationConfig = customScenarios?.find((entry) => entry[0] === scenarioId)!;
        res(runSimulation(session, serializer, simulationConfig[2]));
    });
};

const runSimulation = (
    session: VideoSlotSession | VideoSlotWithFreeGamesSession,
    serializer: VideoSlotSessionSerializer | VideoSlotWithFreeGamesSessionSerializer,
    simulationConfig: SimulationConfig,
) => {
    const simulation = new Simulation(session, simulationConfig);
    session.play();
    simulation.run();
    return serializer.getRoundData(session as VideoSlotWithFreeGamesSession);
};
