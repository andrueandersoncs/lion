/**
 * Properties of `@lionlang/ui`:
 * - Every `ui/*` binding produces JSON-serializable `UiNode` values passing `ui/node?`.
 * - Children flatten nested lists and omit `null`/`false` (composing with `find`, `array/map`, `cond`).
 * - Interactive `dispatch` and streaming `step` mutate one live `LogicDatabase` and re-derive the UI.
 */
import { describe, expect, it } from "@effect/vitest";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Arbitrary, Effect, Schema } from "effect";
import { createUiSession, makeUiBindings } from "../index.ts";
import { isUiNode, UI_KINDS, type UiNode } from "../types.ts";

const OPTIONS = { arbitrary: { runs: 100 } };

const env = { ...stdlib, ...makeUiBindings() };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

const labelArb = element([
  "Total",
  "Nights",
  "Policy",
  "Status",
  "Margin",
  "Source",
]);

describe("@lionlang/ui bindings", () => {
  it.effect.prop(
    "every ui/* constructor returns a JSON-serializable node passing ui/node?",
    {
      kind: element(UI_KINDS),
      label: labelArb,
      value: int(-50, 500),
    },
    ({ kind, label, value }) =>
      Effect.gen(function* () {
        const expr =
          kind === "why" || kind === "proof"
            ? [`ui/${kind}`, { title: label }, { ok: true, value }]
            : [`ui/${kind}`, { label, value }, label];
        const node = yield* run(expr, env);
        expect(isUiNode(node)).toBe(true);
        const checked = yield* run(["ui/node?", ["quote", node]], env);
        expect(checked).toBe(true);
        // Round-trips cleanly through JSON.
        expect(JSON.parse(JSON.stringify(node))).toEqual(node);
      }),
    OPTIONS
  );

  it.effect.prop(
    "flattens lists from find/map and omits null/false children from cond",
    {
      items: Arbitrary.array(int(1, 50), { maxLength: 6, minLength: 1 }),
      showBanner: element([true, false]),
    },
    ({ items, showBanner }) =>
      Effect.gen(function* () {
        const program = [
          "begin",
          ["relation", "item", ["n"]],
          ["fact", ...items.map((n) => ["item", n])],
          [
            "ui/stack",
            ["cond", [showBanner, ["ui/badge", "active"]]],
            ["find", ["ui/text", ["number/toString", "?n"]], ["item", "?n"]],
          ],
        ];
        const node = (yield* run(program, env)) as UiNode;
        expect(isUiNode(node)).toBe(true);
        const unique = new Set(items).size;
        expect(node.children.length).toBe(unique + (showBanner ? 1 : 0));
        expect(node.children.every((child) => isUiNode(child))).toBe(true);
      }),
    OPTIONS
  );
});

describe("@lionlang/ui interactive & streaming sessions", () => {
  it.effect.prop(
    "dispatch updates keyed facts and re-derives the view immediately",
    {
      initialNights: int(1, 5),
      nextNights: int(1, 10),
      rate: int(50, 300),
    },
    ({ initialNights, nextNights, rate }) =>
      Effect.gen(function* () {
        const session = createUiSession();
        const program = [
          "begin",
          ["relation", "field", ["k", "v"], { key: ["k"] }],
          ["fact", ["field", "nights", initialNights]],
          [
            "define",
            "view",
            [
              "lambda",
              [],
              [
                "begin",
                [
                  "define",
                  "n",
                  ["array/head", ["find", "?v", ["field", "nights", "?v"]]],
                ],
                [
                  "ui/metric",
                  {
                    label: "Total",
                    value: ["number/multiply", "n", rate],
                  },
                ],
              ],
            ],
            { persist: true },
          ],
          ["view"],
        ];
        const first = (yield* session.load(program)) as UiNode;
        expect(first.$ui).toBe("metric");
        expect(first.props.value).toBe(initialNights * rate);

        const updated = (yield* session.dispatch(
          ["fact", ["field", "nights", "value"]],
          nextNights
        )) as UiNode;
        expect(updated.$ui).toBe("metric");
        expect(updated.props.value).toBe(nextNights * rate);
      }),
    OPTIONS
  );

  it.effect.prop(
    "step streams facts incrementally and automatically fires derived UI alerts",
    {
      a: int(80, 99),
      b: int(80, 99),
    },
    ({ a, b }) =>
      Effect.gen(function* () {
        const session = createUiSession();
        const init = [
          "begin",
          ["relation", "claim", ["src", "val"]],
          ["relation", "disputed", ["vals"]],
          [
            "rule",
            ["disputed", ["aggregate/unique", "?v"]],
            ["claim", "?s1", "?v"],
            ["claim", "?s2", "?v2"],
            ["not", ["=", "?v", "?v2"]],
          ],
          [
            "define",
            "view",
            [
              "lambda",
              [],
              [
                "ui/stack",
                [
                  "ui/metric",
                  {
                    label: "Claims",
                    value: [
                      "array/length",
                      ["find", "?s", ["claim", "?s", "?_"]],
                    ],
                  },
                ],
                [
                  "cond",
                  [
                    ["disputed", "?_"],
                    ["ui/alert", { tone: "warn", title: "Dispute" }],
                  ],
                ],
              ],
            ],
            { persist: true },
          ],
          ["view"],
        ];

        const v0 = (yield* session.load(init)) as UiNode;
        expect(v0.children.length).toBe(1);

        const v1 = (yield* session.step([
          "fact",
          ["claim", "s1", a],
        ])) as UiNode;
        expect((v1.children[0] as UiNode).props.value).toBe(1);
        expect(v1.children.length).toBe(1);

        const v2 = (yield* session.step([
          "fact",
          ["claim", "s2", b],
        ])) as UiNode;
        expect((v2.children[0] as UiNode).props.value).toBe(2);
        expect(v2.children.length).toBe(a === b ? 1 : 2);
      }),
    OPTIONS
  );
});
