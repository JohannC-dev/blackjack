import { Schema } from "effect";
import { MINES_TARGETS } from "../src/lib/mines";

const TableId = Schema.String.pipe(Schema.pattern(/^[A-Z0-9]{4,12}$/));
const Name = Schema.String.pipe(Schema.minLength(1));
const NonNegativeNumber = Schema.Number.pipe(
  Schema.finite(),
  Schema.greaterThanOrEqualTo(0),
);
const Seat = Schema.Int.pipe(Schema.between(0, 4));
const Index = Schema.Int.pipe(Schema.between(0, 24));
const MinesTarget = Schema.Literal(...MINES_TARGETS);
const HandId = Schema.String.pipe(Schema.minLength(1));

export const JoinSchema = Schema.Struct({
  tableId: Schema.optional(Schema.Union(TableId, Schema.Null)),
  createPrivate: Schema.optional(Schema.Literal(true)),
});

const BetSchema = Schema.Struct({
  main: NonNegativeNumber,
  three: NonNegativeNumber,
  pairs: NonNegativeNumber,
});

export const BlackjackCommandSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("claim"), seat: Seat }),
  Schema.Struct({ type: Schema.Literal("release"), seat: Seat }),
  Schema.Struct({ type: Schema.Literal("bet"), seat: Seat, bet: BetSchema }),
  Schema.Struct({ type: Schema.Literal("repeat") }),
  Schema.Struct({
    type: Schema.Literal("ready"),
    ready: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Union(
      Schema.Literal("hit"),
      Schema.Literal("stand"),
      Schema.Literal("split"),
    ),
    handId: HandId,
  }),
  Schema.Struct({
    type: Schema.Literal("double"),
    handId: HandId,
    reveal: Schema.optional(
      Schema.Union(Schema.Literal("now"), Schema.Literal("dealer")),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal("gamble"),
    color: Schema.Union(Schema.Literal("red"), Schema.Literal("black")),
  }),
  Schema.Struct({ type: Schema.Literal("cashout") }),
  Schema.Struct({ type: Schema.Literal("refill") }),
);

const PokerMode = Schema.Union(Schema.Literal("cash"), Schema.Literal("spin"));
const PokerAction = Schema.Union(
  Schema.Literal("fold"),
  Schema.Literal("check"),
  Schema.Literal("call"),
  Schema.Literal("raise"),
  Schema.Literal("all-in"),
);

export const PokerCommandSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("match"),
    mode: PokerMode,
    stake: NonNegativeNumber,
    buyIn: Schema.optional(NonNegativeNumber),
  }),
  Schema.Struct({ type: Schema.Literal("leave") }),
  Schema.Struct({
    type: Schema.Literal("action"),
    action: PokerAction,
    amount: Schema.optional(NonNegativeNumber),
  }),
  Schema.Struct({ type: Schema.Literal("muck") }),
  Schema.Struct({ type: Schema.Literal("show") }),
  Schema.Struct({ type: Schema.Literal("chat"), text: Name }),
);

const TowerDifficulty = Schema.Union(
  Schema.Literal("easy"),
  Schema.Literal("normal"),
  Schema.Literal("hard"),
  Schema.Literal("impossible"),
);

export const TowerCommandSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("start"),
    difficulty: TowerDifficulty,
    bet: NonNegativeNumber,
  }),
  Schema.Struct({
    type: Schema.Literal("pick"),
    column: Schema.Int.pipe(Schema.between(0, 4)),
  }),
  Schema.Struct({ type: Schema.Literal("cashout") }),
);

export const MinesCommandSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("start"),
    bet: NonNegativeNumber,
    target: MinesTarget,
  }),
  Schema.Struct({ type: Schema.Literal("reveal"), index: Index }),
  Schema.Struct({
    type: Schema.Literal("playPattern"),
    bet: NonNegativeNumber,
    target: MinesTarget,
    indexes: Schema.Array(Index),
  }),
  Schema.Struct({ type: Schema.Literal("cashout") }),
);

export const EmoteRequestSchema = Schema.Struct({
  game: Schema.Union(Schema.Literal("blackjack"), Schema.Literal("poker")),
  emote: Schema.String.pipe(Schema.minLength(1)),
  targetId: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
});
