import { Boolean as Bool, Effect, flow, Schema } from "effect";
import { decode } from "@/modules/lib/shared";

const operator = (operate: (a: boolean, b: boolean) => boolean) =>
  flow(
    (a: unknown, b: unknown) => [a, b],
    decode(Schema.Tuple([Schema.Boolean, Schema.Boolean])),
    Effect.map(([a, b]) => operate(a, b))
  );

export const module = {
  symbol: Symbol("boolean"),

  "equals?": operator((a, b) => a === b),
  not: flow(decode(Schema.Boolean), Effect.map(Bool.not)),
  and: operator(Bool.and),
  or: operator(Bool.or),
  xor: operator(Bool.xor),
  nand: operator(Bool.nand),
  nor: operator(Bool.nor),
};
