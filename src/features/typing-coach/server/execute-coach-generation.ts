import "server-only";

import { runTypingCoachForUser } from "./run-typing-coach";

export async function executeCoachGenerationForUser(userId: string) {
  return runTypingCoachForUser(userId, "last_30d");
}
