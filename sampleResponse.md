Session wise game state in memory
{
  session: SwfgSession {
    baseSession: VideoSlotSession {
      baseSession: [GameSession],
      config: [SwfgConfig],
      combinationsGenerator: [SymbolsCombinationsGenerator],
      winCalculator: [SwfgSessionWinCalculator],
      winAmount: 0,
      symbolsCombination: [SymbolsCombination]
    },
    config: SwfgConfig {
      baseConfig: [VideoSlotConfig],
      freeGamesForScattersMap: [Object],
      normalSequences: [Array],
      freeGamesSequences: [Array],
      normalPatterns: [LeftToRightLinesPatterns],
      freeGamesPatterns: [ScatteredLinesPatterns],
      freeGamesMode: false
    },
    freeGamesNum: 0,
    freeGamesSum: 0,
    freeBank: 0
  },
  serializer: VideoSlotWithFreeGamesSessionSerializer {
    baseSerializer: VideoSlotSessionSerializer {
      baseSerializer: GameSessionSerializer {}
    }
  },
  scenarios: [
    [ 'fg', 'Free games', [SimulationConfig] ],
    [ 'fgBank', 'Last free game with free bank', [SimulationConfig] ],
    [
      'fgNoBank',
      'Last free game without free bank',
      [SimulationConfig]
    ],
    [ 'scLines', 'Lines and scatters', [SimulationConfig] ]
  ]
}