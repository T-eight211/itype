import { createGateway } from "@ai-sdk/gateway";

export const TYPING_COACH_MODEL_ID = "openai/gpt-4o-mini";

const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;

const coachGateway = createGateway({
  apiKey,
});

export const typingCoachModel = coachGateway(TYPING_COACH_MODEL_ID);

export const TYPING_COACH_GENERATION_PARAMS = {
  temperature: 0.2,
} as const;
