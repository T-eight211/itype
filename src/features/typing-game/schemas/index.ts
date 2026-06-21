// Central export file for typing-game schemas. Other modules import from here
// instead of knowing the exact schema file path.
export {
  KeyboardRowSchema,
  FingerSchema,
  PositionInWordSchema,
  ErrorTypeSchema,
  KeyPairDetailSchema,
  SubstitutionEventSchema,
  TranspositionEventSchema,
  OmissionEventSchema,
  InsertionEventSchema,
  PauseEventSchema,
  WordErrorEventSchema,
} from "./word-error-event";

export type {
  WordErrorEvent,
  KeyPairDetail,
  KeyboardRow,
  Finger,
  ErrorType,
  PositionInWord,
} from "./word-error-event";

export {
  FinalStatusSchema,
  WordMistakeSchema,
  WordMistakeBatchSchema,
} from "./word-mistake";

export type {
  WordMistake,
  WordMistakeBatch,
  FinalStatus,
} from "./word-mistake";
