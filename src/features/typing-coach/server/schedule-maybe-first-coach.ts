"use server";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { executeCoachGenerationForUser } from "./execute-coach-generation";
import { preflightCoachGeneration } from "./preflight-first-coach-generation";

export async function scheduleMaybeFirstTypingCoachRun(): Promise<void> {
  // Server action helper called after a typing result is saved. Clerk gives the
  // current signed-in user ID on the server.
  const { userId } = await auth();
  if (!userId) return;

  // Check whether this user is eligible and whether enough new data exists.
  const { shouldRun } = await preflightCoachGeneration(userId);
  if (!shouldRun) return;

  // Next.js after() runs this work after the response/render has finished, so
  // saving the typing result does not wait for the AI model call.
  after(async () => {
    try {
      // Run the full aggregate -> model -> database feedback pipeline.
      await executeCoachGenerationForUser(userId);
    } catch (err) {
      console.error("typing-coach executeCoachGenerationForUser failed:", err);
    }
  });
}
