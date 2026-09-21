import { describe, expect, it } from "vitest";
import { handleWorkerRequest } from "./worker-protocol";

describe("editor worker protocol", () => {
  it("returns serializable revisioned analysis", async () => {
    const response = await handleWorkerRequest({
      type: "analyze",
      requestId: 4,
      revision: 9,
      sourceText: '["number/add", 1, 2]',
    });
    expect(response.type).toBe("analysis");
    if (response.type === "analysis") {
      expect(response.projection.revision).toBe(9);
      expect(response.projection.status).toBe("valid");
      expect(response.projection.nodes).toHaveLength(4);
      expect(() => structuredClone(response)).not.toThrow();
    }
  });

  it("returns structured invalid-source diagnostics without throwing", async () => {
    const response = await handleWorkerRequest({
      type: "analyze",
      requestId: 1,
      revision: 2,
      sourceText: "[1,",
    });
    expect(response.type).toBe("analysis");
    if (response.type === "analysis") {
      expect(response.projection.status).toBe("invalid-json");
      expect(response.projection.diagnostics[0]?.category).toBe("json-syntax");
    }
  });

  it("places child values left of their consuming expression", async () => {
    const response = await handleWorkerRequest({
      type: "layout",
      requestId: 2,
      revision: 3,
      nodes: [
        { id: "$", parentId: null },
        { id: "/1", parentId: "$" },
        { id: "/2", parentId: "$" },
      ],
    });
    expect(response.type).toBe("layout");
    if (response.type === "layout") {
      expect(response.positions["/1"]?.x).toBeLessThan(
        response.positions.$?.x ?? 0
      );
      expect(response.positions["/2"]?.x).toBeLessThan(
        response.positions.$?.x ?? 0
      );
    }
  });
});
