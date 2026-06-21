// Central badge requirements. The evaluator imports these values instead of
// hard-coding numbers inside the badge logic.
export const BADGE_THRESHOLDS = {
  // Speed badges are based on WPM from the completed game.
  speed: {
    fastFingersWpm: 60,
    speedDemonWpm: 80,
    lightningTypistWpm: 100,
  },
  // Accuracy badges are based on the user's average accuracy across saved tests.
  accuracy: {
    sharpShooterAverage: 95,
    perfectRunAverage: 100,
  },
  // Streak badges use the current streak after the completed game.
  streak: {
    gettingStartedDays: 3,
    consistentDays: 7,
    unstoppableDays: 30,
  },
  // Level badges use the XP level after XP has been awarded.
  level: {
    levelUp: 10,
    proTypist: 50,
    masterTypist: 100,
  },
  // Practice badges count how many typing tests the user has completed.
  practice: {
    firstSteps: 1,
    dedicated: 100,
    grinder: 1000,
  },
  // Special badges are based on how early the user completed their first game.
  special: {
    founder: 10,
    earlyAdopter: 100,
    pioneer: 1000,
  },
} as const;
