import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const VALID_FIXTURE = '{\n  "message": "héllo"\n}\n';
const INVALID_FIXTURE = "[1,\n";
const RUNTIME_FAILURE_FIXTURE = "[1, 2]";
const LARGE_FIXTURE = JSON.stringify([
  "quote",
  Array.from({ length: 5000 }, (_, index) => index),
]);
const NODE_RUN_FIXTURE = JSON.stringify([
  "begin",
  ["define", "x", 5],
  ["number/add", 1, 2],
  ["lambda", ["y"], "y"],
  ["cond", [true, 0], ["else", 1]],
  ["quote", ["number/add", 2, 3]],
]);
const SERIOUS_IMPACTS = new Set(["critical", "serious"]);
const STALE_GRAPH_PATTERN = /Graph at r/;
const LARGE_GRAPH_PATTERN = /5003 total · 300 shown/;
const REPLACE_BUTTON_PATTERN = /^Replace /;
const ARROW_MARKER_PATTERN = /arrowclosed/;

const gotoEditor = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
};

test("new, edit, graph mutation, run, and shared undo remain synchronized", async ({
  page,
}) => {
  await gotoEditor(page);
  await expect(page.getByText("Lion Fold Map")).toBeVisible();
  await expect(page.getByTestId("semantic-graph")).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();
  await expect(page.getByText("Save", { exact: true })).toBeVisible();
  const selectedNode = page.locator(".graph-node-selected");
  await expect(selectedNode).toBeVisible();
  await expect
    .poll(async () => (await selectedNode.boundingBox())?.width ?? 0)
    .toBeGreaterThan(220);

  await page.getByRole("button", { name: "Run" }).click();
  const outputDock = page.getByRole("region", {
    name: "Evaluation output: succeeded",
  });
  await expect(outputDock).toBeVisible();
  await expect(outputDock.getByText("3", { exact: true })).toBeVisible();
  await expect(outputDock.locator(".evaluation-dock-summary")).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await outputDock.locator(".evaluation-dock-summary").click();
  await expect(outputDock.locator(".evaluation-dock-body")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show evaluation output: succeeded" })
    .click();
  await expect(outputDock.locator(".evaluation-dock-body")).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Search graph by name, value, or JSON Pointer",
  });
  await search.fill("/1");
  await search.press("Enter");
  const numberInput = page.getByRole("spinbutton", {
    name: "Number value at /1",
  });
  await expect(numberInput).toBeVisible();
  await numberInput.fill("4");
  await numberInput.press("Enter");
  await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();
  await expect(
    page
      .getByRole("region", { name: "Evaluation output: succeeded" })
      .getByText("6", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
});

test("graph keyboard navigation replaces the detached outline", async ({
  page,
}) => {
  await gotoEditor(page);
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".graph-node-selected")).toHaveAttribute(
    "aria-label",
    "primitive: 1"
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".graph-node-selected")).toHaveAttribute(
    "aria-label",
    "call: number/add"
  );
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".graph-node-selected")).toHaveAttribute(
    "aria-label",
    "primitive: 1"
  );
  await page.keyboard.press("?");
  await expect(
    page.locator('aside[aria-label="Graph keyboard shortcuts"]')
  ).toBeVisible();
  await page.keyboard.press("?");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Replace expression" })
  ).toBeVisible();
});

test("selecting a graph node preserves the camera", async ({ page }) => {
  await gotoEditor(page);
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(700);
  const cameraBeforeSelection = await viewport.evaluate(
    (element) => getComputedStyle(element).transform
  );

  await page
    .locator('.graph-node[aria-label="primitive: 1"]')
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(".graph-node-selected")).toHaveAttribute(
    "aria-label",
    "primitive: 1"
  );
  await page.waitForTimeout(500);

  expect(
    await viewport.evaluate((element) => getComputedStyle(element).transform)
  ).toBe(cameraBeforeSelection);
});

test("literal nodes fit their editors without empty body space", async ({
  page,
}) => {
  await gotoEditor(page);
  const literalNodes = page.locator('.graph-node[data-kind="primitive"]');
  await expect(literalNodes).toHaveCount(2);
  await expect
    .poll(async () =>
      literalNodes.evaluateAll((nodes) =>
        Math.max(
          ...nodes.map((node) => {
            const summary = node.querySelector(".graph-literal-summary");
            return summary
              ? Math.round(
                  node.getBoundingClientRect().height -
                    summary.getBoundingClientRect().height
                )
              : 999;
          })
        )
      )
    )
    .toBeLessThanOrEqual(2);
});

test("node runs evaluate only expression-like subtrees", async ({ page }) => {
  await gotoEditor(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "node-run.json",
    mimeType: "application/json",
    buffer: Buffer.from(NODE_RUN_FIXTURE),
  });

  await expect(page.getByRole("button", { name: "Run begin" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run number/add" })
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Run lambda" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run quote" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run define" })).toHaveCount(0);
  await expect(
    page.locator(
      '.graph-node[data-kind="primitive"] button[aria-label^="Run "]'
    )
  ).toHaveCount(0);
  await expect(
    page.locator('.graph-node[title^="/3/1 "] button[aria-label^="Run "]')
  ).toHaveCount(0);
  await expect(
    page.locator('.graph-node[title^="/4/1 "] button[aria-label^="Run "]')
  ).toHaveCount(0);
  await expect(
    page.locator('.graph-node[title^="/5/1 "] button[aria-label^="Run "]')
  ).toHaveCount(0);

  const quotedArray = page.locator('.graph-node[title^="/5/1 "]');
  await expect(quotedArray).toHaveAttribute("data-kind", "array");
  await expect(quotedArray.locator(".graph-node-header")).toHaveText(
    "array · 3"
  );

  await page
    .getByRole("button", { name: "Run number/add" })
    .evaluate((button: HTMLButtonElement) => button.click());
  const output = page.getByRole("region", {
    name: "Evaluation output: succeeded",
  });
  await expect(output.locator(".evaluation-dock-preview")).toHaveText(
    "number/add · /2"
  );
  await expect(output.locator(".result-code")).toHaveText("3");
});

test("graph edges point from values into their consuming expressions", async ({
  page,
}) => {
  await gotoEditor(page);
  await expect(page.getByTestId("rf__edge-/1->$")).toBeVisible();
  await expect(page.getByTestId("rf__edge-$->/1")).toHaveCount(0);
  await expect(
    page.getByTestId("rf__edge-/1->$").locator(".react-flow__edge-path")
  ).toHaveAttribute("marker-end", ARROW_MARKER_PATTERN);
  const valueNode = page.locator('.react-flow__node[data-id="/1"]');
  const consumerNode = page.locator('.react-flow__node[data-id="$"]');
  await expect(
    valueNode.locator('.react-flow__handle.source[data-handleid="source:/1"]')
  ).toBeVisible();
  await expect(consumerNode.locator(".react-flow__handle.target")).toHaveCount(
    2
  );
  await expect(
    consumerNode.locator(".graph-port-target .graph-port-label")
  ).toHaveText(["[1]", "[2]"]);
  await expect(
    consumerNode.locator(
      '.react-flow__handle.target[data-handleid="target:/1"]'
    )
  ).toBeVisible();
  await expect
    .poll(async () => {
      const [valueBox, consumerBox] = await Promise.all([
        valueNode.boundingBox(),
        consumerNode.boundingBox(),
      ]);
      return valueBox && consumerBox ? consumerBox.x - valueBox.x : 0;
    })
    .toBeGreaterThan(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "record.json",
    mimeType: "application/json",
    buffer: Buffer.from(VALID_FIXTURE),
  });
  await expect(
    page.locator(
      '.react-flow__node[data-id="$"] .graph-node[data-kind="record"]'
    )
  ).toBeVisible();
  await expect(
    page
      .locator('.react-flow__node[data-id="$"]')
      .locator(".graph-port-target .graph-port-label")
  ).toHaveText("message");

  await page.getByRole("button", { name: "Jev" }).click();

  const graphNodes = page.locator(".react-flow__node");
  const graphEdges = page.locator(".react-flow__edge");
  await expect(graphNodes).toHaveCount(27);
  await expect
    .poll(async () => (await graphEdges.count()) - (await graphNodes.count()))
    .toBe(-1);
});

test("invalid source keeps the graph blocked until a new document", async ({
  page,
}) => {
  await gotoEditor(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(INVALID_FIXTURE),
  });
  await expect(page.getByText("Invalid JSON", { exact: true })).toBeVisible();
  await expect(page.getByText(STALE_GRAPH_PATTERN)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run" })).toBeDisabled();
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page.getByText("Invalid JSON", { exact: true })).toHaveCount(0);
  await expect(page.getByText(STALE_GRAPH_PATTERN)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run" })).toBeEnabled();
});

test("fallback import preserves text and download saves current bytes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    });
  });
  await gotoEditor(page);
  const source = VALID_FIXTURE;
  await page.locator('input[type="file"]').setInputFiles({
    name: "unicode.json",
    mimeType: "application/json",
    buffer: Buffer.from(source),
  });
  await page
    .locator(".graph-node-selected")
    .getByRole("button", { name: REPLACE_BUTTON_PATTERN })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Expression JSON" })
    .fill('{"message":"héllo!"}');
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("unicode.json");
  await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
});

test("runtime failures stay separate from valid analysis", async ({ page }) => {
  await gotoEditor(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "runtime-failure.json",
    mimeType: "application/json",
    buffer: Buffer.from(RUNTIME_FAILURE_FIXTURE),
  });
  await expect(page.getByRole("button", { name: "Run" })).toBeEnabled();
  await page.getByRole("button", { name: "Run" }).click();
  const failureDock = page.getByRole("region", {
    name: "Evaluation output: failed",
  });
  await expect(failureDock).toBeVisible();
  await expect(failureDock.getByText("InvalidFunctionCallError")).toBeVisible();
});

test("the folded graph bounds rendering for 5,000-node source", async ({
  page,
}) => {
  await gotoEditor(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(LARGE_FIXTURE),
  });
  await expect(page.getByText(LARGE_GRAPH_PATTERN)).toBeVisible({
    timeout: 20_000,
  });
});

test("primary workflow is keyboard reachable and has no serious axe violations", async ({
  page,
}) => {
  await gotoEditor(page);
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+K" : "Control+K"
  );
  await expect(
    page.getByRole("dialog", { name: "Command Palette" })
  ).toBeVisible();
  await page.getByPlaceholder("Type a command or action…").fill("run current");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Evaluation output: succeeded" })
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Command Palette" })
  ).toBeHidden();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) =>
      impact ? SERIOUS_IMPACTS.has(impact) : false
    )
  ).toEqual([]);
});
