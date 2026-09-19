import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const VALID_FIXTURE = '{\n  "message": "héllo"\n}\n';
const INVALID_FIXTURE = "[1,\n";
const RUNTIME_FAILURE_FIXTURE = "[1, 2]";
const LARGE_FIXTURE = JSON.stringify([
  "quote",
  Array.from({ length: 5000 }, (_, index) => index),
]);
const SERIOUS_IMPACTS = new Set(["critical", "serious"]);
const STALE_GRAPH_PATTERN = /Graph at r/;
const LARGE_GRAPH_PATTERN = /5003 total · 300 shown/;

const gotoEditor = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
};

const showGraphOnNarrowViewport = async (page: Page) => {
  const graphTab = page.getByRole("tab", { name: "Graph" });
  if ((await graphTab.count()) > 0) {
    await graphTab.click();
  }
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
  await page.getByRole("tab", { name: "Result" }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("tabpanel", { name: "Result" })
      .getByText("3", { exact: true })
  ).toBeVisible();
  await showGraphOnNarrowViewport(page);

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
      .getByRole("tabpanel", { name: "Result" })
      .getByText("6", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
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
    .getByRole("toolbar", { name: "Selected expression actions" })
    .getByRole("button", { name: "Replace", exact: true })
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
  await page.getByRole("tab", { name: "Result" }).click();
  await expect(page.getByText("failed", { exact: true })).toBeVisible();
  await expect(page.getByText("InvalidFunctionCallError")).toBeVisible();
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
  await page.getByRole("tab", { name: "Result" }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) =>
      impact ? SERIOUS_IMPACTS.has(impact) : false
    )
  ).toEqual([]);
});
