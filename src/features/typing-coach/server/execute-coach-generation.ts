import "server-only";

import { runTypingCoachForUser } from "./run-typing-coach";

export async function executeCoachGenerationForUser(userId: string) {
  // Thin wrapper used by background scheduling. The real generation flow lives in
  // runTypingCoachForUser().
  return runTypingCoachForUser(userId);
}
