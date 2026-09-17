import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeUiEnv } from "./ui-env";

describe("makeUiEnv", () => {
  it("evaluates Lion source into a React element", () => {
    const result = Effect.runSync(
      run(
        ["div", { className: "price" }, ["format/usd", 1234.5]],
        makeUiEnv(stdlib)
      )
    );

    if (!isValidElement(result)) {
      throw new TypeError(
        "Expected Lion source to evaluate to a React element"
      );
    }
    expect(renderToStaticMarkup(result)).toBe(
      '<div class="price">$1,234.50</div>'
    );
  });
});
