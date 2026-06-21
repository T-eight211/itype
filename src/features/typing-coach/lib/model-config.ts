import { createGateway } from "@ai-sdk/gateway";

// Model ID used for all typing coach generations through Vercel AI Gateway.
export const TYPING_COACH_MODEL_ID = "openai/gpt-4o-mini";

// API key is read from environment variables so it is never exposed in client
// code or committed to the repository.
const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;

// Gateway client routes model calls through Vercel AI Gateway.
const coachGateway = createGateway({
  apiKey,
});

// Concrete model instance passed into generateObject().
export const typingCoachModel = coachGateway(TYPING_COACH_MODEL_ID);

// Low temperature makes feedback more consistent and less random.
export const TYPING_COACH_GENERATION_PARAMS = {
  temperature: 0.2,
} as const;
