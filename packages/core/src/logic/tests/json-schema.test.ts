import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import { databaseToJsonSchema, toJsonSchema } from "@/logic/json-schema";
import { safeStdlib } from "@/modules";

const smallPos = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 }))
);
const choiceWord = Arbitrary.schema(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8))
);

describe("JSON Schema compiler", () => {
  it.effect.prop(
    "compiles records, optional fields, arrays, enums, and open records accurately",
    {
      choices: Arbitrary.array(choiceWord, { maxLength: 4, minLength: 2 }),
      maxItems: smallPos,
    },
    ({ choices, maxItems }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const unique = [...new Set(choices)];
        yield* run(
          [
            "begin",
            [
              "schema",
              "Order",
              {
                id: "value/integer?",
                note: ["schema/optional", "value/string?"],
                status: ["schema/anyOf", ...unique.map((c) => ["quote", c])],
                tags: ["schema/arrayOf", "value/string?", maxItems],
              },
            ],
            ["relation", "order", ["id", "status"]],
          ],
          safeStdlib,
          { database }
        );

        const exported = databaseToJsonSchema(database);
        expect(exported.$schema).toContain("2020-12");
        const orderDef = exported.$defs.Order as {
          readonly additionalProperties: boolean;
          readonly properties: Record<string, Record<string, unknown>>;
          readonly required: readonly string[];
          readonly type: string;
        };
        expect(orderDef.type).toBe("object");
        expect(orderDef.additionalProperties).toBe(false);
        expect(orderDef.required).toEqual(["id", "status", "tags"]);
        expect(orderDef.properties.id).toEqual({ type: "integer" });
        expect(orderDef.properties.note).toEqual({ type: "string" });
        expect(orderDef.properties.status).toEqual({ enum: unique });
        expect(orderDef.properties.tags).toEqual({
          items: { type: "string" },
          maxItems,
          type: "array",
        });

        const relSchema = exported.relations.order as {
          readonly maxItems: number;
          readonly minItems: number;
          readonly prefixItems: readonly Record<string, unknown>[];
        };
        expect(relSchema.minItems).toBe(3);
        expect(relSchema.maxItems).toBe(3);
        expect(relSchema.prefixItems[0]).toEqual({ const: "order" });
      })
  );

  it.effect.prop(
    "terminates and emits $defs/$ref for recursive named schemas",
    { label: choiceWord },
    ({ label }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const treeSchema = yield* run(
          [
            "schema",
            "Tree",
            {
              children: ["schema/arrayOf", "Tree"],
              kind: ["quote", label],
              value: "value/number?",
            },
          ],
          safeStdlib,
          { database }
        );
        const compiled = toJsonSchema(treeSchema, { includeDraftHeader: true });
        expect(compiled.$ref).toBe("#/$defs/Tree");
        const defs = compiled.$defs as Record<string, Record<string, unknown>>;
        const props = defs.Tree?.properties as Record<
          string,
          Record<string, unknown>
        >;
        expect(props.kind).toEqual({ const: label });
        expect(props.value).toEqual({ type: "number" });
        expect(props.children).toEqual({
          items: { $ref: "#/$defs/Tree" },
          type: "array",
        });
      })
  );
});
