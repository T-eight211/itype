export const BADGE_THRESHOLDS = {
  speed: {
    fastFingersWpm: 60,
    speedDemonWpm: 80,
    lightningTypistWpm: 100,
  },
  accuracy: {
    sharpShooterAverage: 95,
    perfectRunAverage: 100,
  },
  streak: {
    gettingStartedDays: 3,
    consistentDays: 7,
    unstoppableDays: 30,
  },
  level: {
    levelUp: 10,
    proTypist: 50,
    masterTypist: 100,
  },
  practice: {
    firstSteps: 1,
    dedicated: 100,
    grinder: 1000,
  },
  special: {
    founder: 10,
    earlyAdopter: 100,
    pioneer: 1000,
  },
} as const;
