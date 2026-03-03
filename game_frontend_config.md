import { ref, readonly, watch } from 'vue';
import { sound } from '@pixi/sound';
import axios from 'axios';
import gsap from 'gsap';

// --- 1. GAME CONFIGURATION ---
const symbolPaths = {
  Wild: 'icon-wild',
  Scatter1: 'icon-scatter',
  seven: 'icon-777',
  Nine: 'icon-spade',
  Jack: 'icon-J',
  Ten: 'icon-diamond',
  King: 'icon-K',
  Queen: 'icon-Q',
  lemon: 'icon-heart',
  Ace: 'icon-A',
  banana: 'icon-club',
  Scatter2: 'icon-bonus',
};

// --- 2. SHARED REACTIVE STATE ---
const balance = ref(0);
const betAmount = ref(0);
const availableBets = ref(new Set());
const isSpinning = ref(false);
const isCelebrationPlaying = ref(false); // Typo corrected
const isAutoplaying = ref(false);
const outcome = ref([]); 
const reelsForDisplay = ref([]);
const winAmount = ref(0.00);
const displayedWinAmount = ref(0.00);
const winningPaylines = ref([]);
const winningSymbolPositions = ref([]);
const winningScatters = ref([]);
const scatterWinAmount = ref(0);
const isWinAnimationPlaying = ref(false);
const payTable = ref({});
const linesDefinitions = ref({});
const reelsNumber = ref(5);
const reelsSymbolsNumber = ref(4);
const availableSymbols = ref([]);
const sessionId = ref(0);
const multipliers = ref([4, 8, 16, 32])

// --- Free Spin State ---
const isInFreeSpinSession = ref(false);
const freeSpinsAvailable = ref(0);
const freeSpinsTotal = ref(0);
const freeSpinOutcomes = ref([]);
const freeSpinTotalWin = ref(0);
const hasTriggeredFreeSpins = ref(false);
export const gameError = ref(null);
export const isGameReady = ref(false); // NEW: Tracks completion of the initial session API call

// --- PIXI SOUNDS SETUP ---
// We initialize the sounds using Pixi's sound manager. 
// Note: URLs stay the same as they were.




const triggerEffectWithDucking = (soundInstance) => {
  if (!soundInstance) return;

  // 1. Dim Background Music using GSAP
  // Pixi Sound volume is a property, GSAP handles this perfectly
  gsap.to(sounds.backgroundMusic, { volume: 0.1, duration: 0.3 });

  // 2. Play the effect
  soundInstance.volume = 1.0;
  soundInstance.play();

  // 3. Audio Management (Ducking logic)
  setTimeout(() => {
    // Fade out the effect
    gsap.to(soundInstance, { 
        volume: 0, 
        duration: 0.5, 
        onComplete: () => soundInstance.stop() 
    });

    // 4. Slowly increment Background music back to 0.5
    gsap.to(sounds.backgroundMusic, { volume: 0.5, duration: 1.5 });
  }, 1000);
};

// --- AUDIO MANAGEMENT ---
let activeMusic = null;

const manageSound = () => {
  const musicOut = activeMusic;
  let musicIn = null;

  if (isCelebrationPlaying.value) {
    musicIn = sounds.celebrationMusic;
  } else if (isSpinning.value) {
    musicIn = sounds.reelsSound;
  } else {
    musicIn = sounds.backgroundMusic;
  }

  if (musicOut === musicIn) return;

  if (musicOut) {
    // Fade out old music
    gsap.to(musicOut, { 
        volume: 0, 
        duration: 0.5, 
        onComplete: () => musicOut.pause() 
    });
  }

  // Fade in new music
  musicIn.play();
  gsap.to(musicIn, { volume: 0.9, duration: 0.5 });
  
  activeMusic = musicIn;
};

// --- Helper function to generate outcome from API response ---
const endpoint = import.meta.env.VITE_API_BASE_URL;

const startGameSession = async () => {
  gameError.value = null;
  const queryParams = new URLSearchParams(window.location.search);
  const userIdFromUrl = queryParams.get('userId');

  if (!userIdFromUrl) {
    const errorMsg = 'Missing userId in URL. Expected format: ?userId=1';
    gameError.value = errorMsg;
    return { error: errorMsg };
  }

  try {
    const response = await axios.post(`${endpoint}/start-session`, {
      userId: userIdFromUrl,
    });
    
    if (response.data && response.data.status === 'success') {
      return response.data.data;
    } else {
      const errorMessage = response.data?.message || 'Unknown error during session start.';
      gameError.value = errorMessage;
      return { error: errorMessage };
    }
  } catch (error) {
    let errorMessage;
    if (error.response) {
      const serverMessage = error.response.data?.message || error.response.statusText;
      errorMessage = `Server error: ${serverMessage}`;
    } else if (error.request) {
      errorMessage = 'Network error: No response from server.';
    } else {
      errorMessage = `Request setup error: ${error.message}`;
    }
    gameError.value = errorMessage;
    return { error: errorMessage };
  }
};

const getSpinAndOutcome = async ()=>{
  gameError.value = null; // Reset error before spin
  try {
    const response = await axios.post(`${endpoint}/spin`, {
        "bet":betAmount.value,
        "sessionId": sessionId.value
    });
    return response.data;
  } catch (error) {
    console.error('Axios error in getSpinAndOutcome:', error);
    let errorMessage;
    if (error.response) {
      const serverMessage = error.response.data?.message || error.response.statusText;
      errorMessage = `Server error: ${serverMessage}`;
    } else if (error.request) {
      errorMessage = 'Network error: No response from server.';
    } else {
      errorMessage = `Request setup error: ${error.message}`;
    }
    gameError.value = errorMessage;
    return { error: errorMessage }; // Return an error object
  }
}
const processOutcome = () => {
  const _outcome = outcome.value;
  winAmount.value = _outcome.totalWin ? _outcome.totalWin.toFixed(2) : parseFloat(0).toFixed(2);
  hasTriggeredFreeSpins.value = false;

  // Clear previous win data
  winningPaylines.value = [];
  winningSymbolPositions.value = [];
  winningScatters.value = [];
  scatterWinAmount.value = 0;

  if (_outcome.winningLines && Object.keys(_outcome.winningLines).length > 0) {
    const lines = Object.values(_outcome.winningLines);
    winningPaylines.value = lines;

    const symbolPositions = [];
    lines.forEach(line => {
      const lineDefinition = line.definition; // e.g., [0, 0, 0, 0, 0]
      line.symbolsPositions.forEach(reelIndex => {
        // The line definition gives the row for that reel
        const rowIndex = lineDefinition[reelIndex];
        symbolPositions.push({ reel: reelIndex, row: rowIndex });
      });
    });
    winningSymbolPositions.value = symbolPositions;
  }

  if (_outcome.winningScatters) {
    let totalScatterWin = 0;
    const scatterPositions = [];
    for (const key in _outcome.winningScatters) {
        const scatterData = _outcome.winningScatters[key];
        if (scatterData && scatterData.symbolsPositions) {
            totalScatterWin += scatterData.winAmount;
            scatterData.symbolsPositions.forEach(posArray => {
                scatterPositions.push({ reel: posArray[0], row: posArray[1] });
            });
        }
    }
    if (scatterPositions.length > 0) {
        winningScatters.value = scatterPositions;
        scatterWinAmount.value = totalScatterWin;
    }
  }

  if (_outcome.freeGamesResult?.triggeredFreeGames) {
    hasTriggeredFreeSpins.value = true;
    isInFreeSpinSession.value = true;
    freeSpinsAvailable.value = _outcome.freeGamesResult.numberOfFreeSpins;
    freeSpinsTotal.value = _outcome.freeGamesResult.numberOfFreeSpins;
    freeSpinOutcomes.value = [..._outcome.freeGamesResult.freeGamesSpins];
    freeSpinTotalWin.value = _outcome.freeGamesResult.freeGamesTotalWin;
  }
};

let isInitialized = false;
export async function initializeGame() {
  if (isInitialized) {
    isGameReady.value = true; // Already ready
    return;
  }
  isGameReady.value = false; // Explicitly set to false at the start

  const gameSession = await startGameSession();
  if (gameSession.error) {
    return; // Stop initialization if session start fails
  }
  const initialGrid = gameSession.reelsSymbols;
  sessionId.value = gameSession.sessionId
  balance.value = parseFloat(gameSession.credits).toFixed(2);
  betAmount.value = gameSession.bet;
  availableBets.value = gameSession.availableBets
  outcome.value = gameSession;
  reelsForDisplay.value = initialGrid;

  payTable.value = gameSession.paytable;
  linesDefinitions.value = gameSession.linesDefinitions;
  availableSymbols.value = gameSession.availableSymbols;
  isInitialized = true;
  isGameReady.value = true; // Signal that game data is ready
}



// SOUNDS REFERENCE OBJECT
// We leave this empty initially; it will be populated after loading
const sounds = {
  winAlert: null,
  explosion: null,
  jackpotCoinLoop: null,
  backgroundMusic: null,
  celebrationMusic: null,
  reelsSound: null
};
export function setupLoadedSounds() {
    // Pixi Sound automatically registers assets loaded via PIXI.Assets
    sounds.winAlert = sound.find('winAlert');
    sounds.explosion = sound.find('explosion');
    sounds.youWinVoice = sound.find('youWinVoice');
    sounds.congratulationsVoice = sound.find('congratulationsVoice')
    
    // Configure Looping and Volume for music tracks
    sounds.jackpotCoinLoop = sound.find('jackpotCoinLoop');
    sounds.jackpotCoinLoop.loop = true;
    sounds.jackpotCoinLoop.value = 0;

    sounds.backgroundMusic = sound.find('backgroundMusic');
    sounds.backgroundMusic.loop = true;
    sounds.backgroundMusic.volume = 0.5;

    sounds.celebrationMusic = sound.find('celebrationMusic');
    sounds.celebrationMusic.loop = true;
    sounds.celebrationMusic.volume = 0;

    sounds.reelsSound = sound.find('reelsSound');
    sounds.reelsSound.loop = true;
    sounds.reelsSound.volume = 0;
}


let audioUnlocked = false;
export function useSlotGame() {

  const unlockAudio = () => {
    if (audioUnlocked) return;

    // 1. Force resume the global audio context (Required by browsers)
    sound.resumeAll();

    // 2. ⚡ THE FIX: Use .isPlaying. 
    // If the sound is not currently active, start it.
    if (!sounds.backgroundMusic.isPlaying) {
      sounds.backgroundMusic.play();
      
      // 3. ⚡ CRITICAL: Update the pointer so manageSound() knows 
      // that backgroundMusic is the currently active track.
      activeMusic = sounds.backgroundMusic;
    }

    audioUnlocked = true;
  };

  watch(isCelebrationPlaying, manageSound);

  

  // MAIN SPIN FUNCTION ---
  const spin = async() => {
    if (isSpinning.value || isWinAnimationPlaying.value) return;

    triggerEffectWithDucking(sounds.reelsSound);

    if (isInFreeSpinSession.value) {
      if (freeSpinsAvailable.value > 0) {
        const freeSpinOutcome = freeSpinOutcomes.value.shift();
        outcome.value = freeSpinOutcome;
        freeSpinsAvailable.value--;
        isSpinning.value = true;
        winAmount.value = parseFloat(0).toFixed(2);
        if(freeSpinsAvailable.value == 0){
          isInFreeSpinSession.value = false;
          outcome.value.shouldTriggerBigWinCelebration = true;
        }
      }
    } else {
      if (balance.value < betAmount.value) return;

      isSpinning.value = true;
      winAmount.value = parseFloat(0).toFixed(2);
      const finalOutcome = await getSpinAndOutcome();
      if (finalOutcome.error) {
        isSpinning.value = false;

        // Manually stop the spin sound and restore background music immediately
        gsap.killTweensOf(sounds.reelsSound); // Stop any fades on the sound
        if (sounds.reelsSound) sounds.reelsSound.stop();
        gsap.to(sounds.backgroundMusic, { volume: 0.5, duration: 0.5 });

        return;
      }
      outcome.value = finalOutcome;
    }

    //console.log(outcome.value);
  };

  const finishSpin = () => {

    isSpinning.value = false;
    processOutcome();
  };

  function setBetAmount(bet) {
    unlockAudio();
    betAmount.value = bet;
  };

  function toggleAutoplay() {
    unlockAudio();
    isAutoplaying.value = !isAutoplaying.value;
    if (isAutoplaying.value) {
      spin();
    }
  }

  function setWinAnimationPlaying(value) {
    isWinAnimationPlaying.value = value;
  }

  function startCelebration() {
    isCelebrationPlaying.value = true;

    triggerEffectWithDucking(sounds.celebrationMusic);
  }

  function endCelebration() {
    isCelebrationPlaying.value = false;
    if (sounds.backgroundMusic.volume() < 0.5) {
        sounds.backgroundMusic.fade(sounds.backgroundMusic.volume(), 0.5, 500);
    }
  }

  function updateBalanceFromOutcome() {
    if (outcome.value && typeof outcome.value.credits !== 'undefined') {
      balance.value = outcome.value.credits.toFixed(2);
    }
  }
  
  return { 
    balance: readonly(balance), 
    betAmount: readonly(betAmount),
    availableBets:readonly(availableBets),
    isSpinning: readonly(isSpinning),  
    isWinAnimationPlaying: readonly(isWinAnimationPlaying),
    isCelebrationPlaying: readonly(isCelebrationPlaying),
    isAutoplaying,
    setWinAnimationPlaying,
    startCelebration,
    endCelebration,
    updateBalanceFromOutcome,
    outcome: readonly(outcome), 
    reelsForDisplay: readonly(reelsForDisplay), 
    winAmount: readonly(winAmount),
    displayedWinAmount: displayedWinAmount,
    spin, 
    finishSpin,
    sounds,
    symbolPaths, 
    setBetAmount, 
    toggleAutoplay, 
    winningPaylines: readonly(winningPaylines),
    winningSymbolPositions: readonly(winningSymbolPositions),
    winningScatters: readonly(winningScatters),
    scatterWinAmount: readonly(scatterWinAmount),
    payTable:readonly(payTable),
    linesDefinitions:readonly(linesDefinitions),
    availableSymbols: readonly(availableSymbols),
    reelsNumber: readonly(reelsNumber),
    reelsSymbolsNumber: readonly(reelsSymbolsNumber),
    multipliers: readonly(multipliers),

    // Free Spin Exports
    isInFreeSpinSession: readonly(isInFreeSpinSession),
    freeSpinsAvailable: readonly(freeSpinsAvailable),
    freeSpinsTotal: readonly(freeSpinsTotal),
    freeSpinTotalWin: readonly(freeSpinTotalWin),
    hasTriggeredFreeSpins: readonly(hasTriggeredFreeSpins),
    gameError: readonly(gameError),
    isGameReady: readonly(isGameReady),

  };
}

