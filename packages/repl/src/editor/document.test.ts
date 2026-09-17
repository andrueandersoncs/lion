import { describe, expect, it } from "vitest";
import {
  CanonicalDocument,
  compileEditIntent,
  StaleEditError,
} from "./document";

describe("CanonicalDocument", () => {
  it("keeps source and graph changes in one chronological history", () => {
    const document = new CanonicalDocument('["number/add", 1, 2]');
    document.replaceSource('["number/add", 10, 2]');
    document.applyIntent(
      { type: "replace", path: [2], value: 20 },
      document.snapshot.revision
    );
    expect(document.snapshot.sourceText).toBe('["number/add", 10, 20]');
    expect(document.undo().sourceText).toBe('["number/add", 10, 2]');
    expect(document.undo().sourceText).toBe('["number/add", 1, 2]');
    expect(document.redo().sourceText).toBe('["number/add", 10, 2]');
  });

  it("derives dirty state from exact saved source through undo", () => {
    const document = new CanonicalDocument("1");
    document.replaceSource("2");
    expect(document.snapshot.dirty).toBe(true);
    document.undo();
    expect(document.snapshot.dirty).toBe(false);
    document.redo();
    expect(document.snapshot.dirty).toBe(true);
    document.markSaved();
    expect(document.snapshot.dirty).toBe(false);
  });

  it("rejects graph intents from a stale revision", () => {
    const document = new CanonicalDocument("1");
    const oldRevision = document.snapshot.revision;
    document.replaceSource("2");
    expect(() =>
      document.applyIntent({ type: "replace", path: [], value: 3 }, oldRevision)
    ).toThrow(StaleEditError);
  });

  it("preserves untouched source bytes for replacement and exact subtree bytes for reorder", () => {
    const original =
      '{\n\t"keep":  [1, 2],\n\t"move": [\n\t\t{"x":1},\n\t\t{"y" : 2}\n\t]\n}';
    const replaced = compileEditIntent(original, {
      type: "replace",
      path: ["keep", 1],
      value: 9,
    }).sourceText;
    expect(replaced.startsWith('{\n\t"keep":  [1, 9],\n\t"move":')).toBe(true);
    const moved = compileEditIntent(original, {
      type: "reorder",
      parentPath: ["move"],
      from: 1,
      to: 0,
    }).sourceText;
    expect(moved.indexOf('{"y" : 2}')).toBeLessThan(moved.indexOf('{"x":1}'));
    expect(moved).toContain('{"y" : 2}');
  });

  it("moves an exact subtree across compatible arrays in one undo step", () => {
    const original = '{\n\t"left": [{"kept" : [1, 2]}],\n\t"right": [true]\n}';
    const document = new CanonicalDocument(original);
    document.applyIntent(
      {
        type: "move",
        path: ["left", 0],
        targetParentPath: ["right"],
        index: 1,
      },
      document.snapshot.revision
    );
    expect(document.snapshot.sourceText).toContain('{"kept" : [1, 2]}');
    expect(JSON.parse(document.snapshot.sourceText)).toEqual({
      left: [],
      right: [true, { kept: [1, 2] }],
    });
    expect(document.undo().sourceText).toBe(original);
  });
});
