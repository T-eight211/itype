"use server";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { executeCoachGenerationForUser } from "./execute-coach-generation";
import { preflightCoachGeneration } from "./preflight-first-coach-generation";

export async function scheduleMaybeFirstTypingCoachRun(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;

  const { shouldRun } = await preflightCoachGeneration(userId);
  if (!shouldRun) return;

  after(async () => {
    try {
      await executeCoachGenerationForUser(userId);
    } catch (err) {
      console.error("typing-coach executeCoachGenerationForUser failed:", err);
    }
  });
}
