app.ts:177:56 - error TS2345: Argument of type 'SwfgConfig | SwfgConfig | SwfgConfig' is not assignable to parameter of type 'never'.
  The intersection 'import("D:/nodejs_projects/slotgame-backend-nodejs-typescript/src/games/slot-with-free-games-classic/SwfgConfig", { assert: { "resolution-mode": "import" } }).SwfgConfig & import("D:/nodejs_projects/slotgame-backend-nodejs-typescript/src/games/slot-with-free-games-high-frequency/SwfgConfig", { assert: { "resolution-...' was reduced to 'never' because property 'normalSequences' exists in multiple constituents and is private in some.
    Type 'SwfgConfig' is not assignable to type 'never'.

177     const winCalculator = new SwfgSessionWinCalculator(config);
                                                           ~~~~~~

app.ts:178:37 - error TS2345: Argument of type 'SwfgConfig | SwfgConfig | SwfgConfig' is not assignable to parameter of type 'never'.
  The intersection 'import("D:/nodejs_projects/slotgame-backend-nodejs-typescript/src/games/slot-with-free-games-classic/SwfgConfig", { assert: { "resolution-mode": "import" } }).SwfgConfig & import("D:/nodejs_projects/slotgame-backend-nodejs-typescript/src/games/slot-with-free-games-high-frequency/SwfgConfig", { assert: { "resolution-...' was reduced to 'never' because property 'normalSequences' exists in multiple constituents and is private in some.
    Type 'SwfgConfig' is not assignable to type 'never'.

178     const session = new SwfgSession(config, combinationsGenerator, winCalculator);
                                        ~~~~~~


Found 2 errors in the same file, starting at: app.ts:177