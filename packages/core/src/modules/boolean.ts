import { Boolean as Bool, Schema } from "effect";
import { over } from "@/modules/lib/shared";

const operator = (operate: (a: boolean, b: boolean) => boolean) =>
  over([Schema.Boolean, Schema.Boolean], operate);

export const module = {
  symbol: Symbol("boolean"),

  "equals?": operator((a, b) => a === b),
  not: over([Schema.Boolean], Bool.not),
  and: operator(Bool.and),
  or: operator(Bool.or),
  xor: operator(Bool.xor),
  nand: operator(Bool.nand),
  nor: operator(Bool.nor),
};
