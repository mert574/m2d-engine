// Networking: the client, the server's input gate, intents, and the
// replication a server runs.
export { NetClient } from './net/client.ts';
export type { ClientSocket, IntentAnswer, NetStats } from './net/client.ts';
export { InputSchema, InputGate, ViolationMeter } from './net/input.ts';
export type { DecodedInput, DecodeResult, GateOutcome, InputGateOptions, InputMessage } from './net/input.ts';
export { int, slot, num, bool, str, oneOf, list, entity, defineIntents, reject, IntentSet, IntentQueue } from './net/intents.ts';
export type { AnyArg, ArgType, IntentContext, IntentDeclaration, IntentPlayer, Rejection, ResolvedArgs } from './net/intents.ts';
export { Replicator, StateFrame, applyState } from './net/replication.ts';
export type {
  Baseline, PlayerEvent, PlayerEventMap, SpawnRecord, StateMessage, StreamPlayer, Transform, UpdateRecord, WorldEvent
} from './net/replication.ts';
