import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  type Node as JsonNode,
  modify,
  parseTree,
} from "jsonc-parser";
import type {
  DocumentSnapshot,
  EditIntent,
  EditOrigin,
  SourceRange,
} from "./types";

export class StaleEditError extends Error {
  override readonly name = "StaleEditError";
}

export class InvalidEditError extends Error {
  override readonly name = "InvalidEditError";
}

interface HistoryEntry {
  readonly origin: EditOrigin;
  readonly sourceText: string;
}

const FORMATTING_OPTIONS = {
  insertSpaces: false,
  tabSize: 2,
  keepLines: true,
} as const;

const parseStrictTree = (sourceText: string): JsonNode => {
  const errors: Parameters<typeof parseTree>[1] = [];
  const tree = parseTree(sourceText, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (!tree || (errors?.length ?? 0) > 0) {
    throw new InvalidEditError(
      "Graph edits require a valid current Lion document."
    );
  }
  return tree;
};

const reorderArray = (
  sourceText: string,
  tree: JsonNode,
  intent: Extract<EditIntent, { readonly type: "reorder" }>
): string => {
  const arrayNode = findNodeAtLocation(tree, [...intent.parentPath]);
  if (!arrayNode || arrayNode.type !== "array" || !arrayNode.children) {
    throw new InvalidEditError("The reorder target is not an array.");
  }
  const { children } = arrayNode;
  if (
    intent.from < 0 ||
    intent.from >= children.length ||
    intent.to < 0 ||
    intent.to >= children.length
  ) {
    throw new InvalidEditError("The reorder position is outside the array.");
  }
  if (intent.from === intent.to) {
    return sourceText;
  }
  const first = children[0];
  const last = children.at(-1);
  if (!(first && last)) {
    throw new InvalidEditError("An empty array cannot be reordered.");
  }
  const values = children.map((child) =>
    sourceText.slice(child.offset, child.offset + child.length)
  );
  const [moved] = values.splice(intent.from, 1);
  if (moved === undefined) {
    throw new InvalidEditError("The source element no longer exists.");
  }
  values.splice(intent.to, 0, moved);
  const separators = children.slice(0, -1).map((child, index) => {
    const next = children[index + 1];
    return next
      ? sourceText.slice(child.offset + child.length, next.offset)
      : ",";
  });
  const replacement = values
    .map((value, index) => value + (separators[index] ?? ""))
    .join("");
  return `${sourceText.slice(0, first.offset)}${replacement}${sourceText.slice(last.offset + last.length)}`;
};
const isPathPrefix = (
  prefix: readonly (number | string)[],
  path: readonly (number | string)[]
) => prefix.every((segment, index) => path[index] === segment);

const rebasePathAfterRemoval = (
  sourcePath: readonly (number | string)[],
  targetPath: readonly (number | string)[]
) => {
  const next = [...targetPath];
  let shared = 0;
  while (
    shared < sourcePath.length &&
    shared < targetPath.length &&
    sourcePath[shared] === targetPath[shared]
  ) {
    shared += 1;
  }
  const removedIndex = sourcePath[shared];
  const targetIndex = targetPath[shared];
  if (
    typeof removedIndex === "number" &&
    typeof targetIndex === "number" &&
    removedIndex < targetIndex
  ) {
    next[shared] = targetIndex - 1;
  }
  return next;
};

const moveSubtree = (
  sourceText: string,
  tree: JsonNode,
  intent: Extract<EditIntent, { readonly type: "move" }>
) => {
  if (intent.path.length === 0) {
    throw new InvalidEditError("The root cannot move into its own subtree.");
  }
  if (isPathPrefix(intent.path, intent.targetParentPath)) {
    throw new InvalidEditError("A subtree cannot move inside itself.");
  }
  const sourceNode = findNodeAtLocation(tree, [...intent.path]);
  if (!sourceNode) {
    throw new InvalidEditError("The moved subtree no longer exists.");
  }
  const sourceParent = intent.path.slice(0, -1);
  const sourceKey = intent.path.at(-1);
  if (
    sourceParent.length === intent.targetParentPath.length &&
    sourceParent.every(
      (segment, index) => segment === intent.targetParentPath[index]
    ) &&
    typeof sourceKey === "number" &&
    intent.index !== undefined
  ) {
    return reorderArray(sourceText, tree, {
      type: "reorder",
      parentPath: sourceParent,
      from: sourceKey,
      to: intent.index,
    });
  }
  if (
    typeof sourceKey === "string" &&
    intent.key !== undefined &&
    sourceKey !== intent.key
  ) {
    throw new InvalidEditError("Moving an object value cannot rename its key.");
  }

  const rawSubtree = sourceText.slice(
    sourceNode.offset,
    sourceNode.offset + sourceNode.length
  );
  const withoutSource = applyEdits(
    sourceText,
    modify(sourceText, [...intent.path], undefined, {
      formattingOptions: FORMATTING_OPTIONS,
    })
  );
  const targetParentPath = rebasePathAfterRemoval(
    intent.path,
    intent.targetParentPath
  );
  const withoutSourceTree = parseStrictTree(withoutSource);
  const targetParent = findNodeAtLocation(withoutSourceTree, targetParentPath);
  if (!targetParent) {
    throw new InvalidEditError("The move target no longer exists.");
  }
  const sentinel = "__lion_editor_moved_subtree__";
  let targetPath: (number | string)[];
  let isArrayInsertion = false;
  if (targetParent.type === "array" && intent.index !== undefined) {
    targetPath = [...targetParentPath, intent.index];
    isArrayInsertion = true;
  } else if (targetParent.type === "object" && intent.key !== undefined) {
    targetPath = [...targetParentPath, intent.key];
  } else {
    throw new InvalidEditError("The target role cannot accept this subtree.");
  }
  const withSentinel = applyEdits(
    withoutSource,
    modify(withoutSource, targetPath, sentinel, {
      formattingOptions: FORMATTING_OPTIONS,
      isArrayInsertion,
    })
  );
  const sentinelTree = parseStrictTree(withSentinel);
  const sentinelNode = findNodeAtLocation(sentinelTree, targetPath);
  if (!sentinelNode) {
    throw new InvalidEditError("The move target could not be materialized.");
  }
  return `${withSentinel.slice(0, sentinelNode.offset)}${rawSubtree}${withSentinel.slice(sentinelNode.offset + sentinelNode.length)}`;
};

const compileValueIntent = (
  sourceText: string,
  tree: JsonNode,
  intent: Exclude<EditIntent, { readonly type: "move" | "reorder" }>
) => {
  let path: (number | string)[];
  let value: unknown;
  let isArrayInsertion = false;
  if (intent.type === "replace") {
    path = [...intent.path];
    value = intent.value;
  } else if (intent.type === "remove") {
    if (intent.path.length === 0) {
      throw new InvalidEditError(
        "The root cannot be deleted; replace it instead."
      );
    }
    path = [...intent.path];
    value = undefined;
  } else {
    const parent = findNodeAtLocation(tree, [...intent.parentPath]);
    if (!parent) {
      throw new InvalidEditError("The insertion target no longer exists.");
    }
    if (parent.type === "array" && intent.index !== undefined) {
      path = [...intent.parentPath, intent.index];
      isArrayInsertion = true;
    } else if (parent.type === "object" && intent.key !== undefined) {
      if (!intent.key || intent.key === "__proto__") {
        throw new InvalidEditError(
          "Object keys must be non-empty and cannot be __proto__."
        );
      }
      path = [...intent.parentPath, intent.key];
    } else {
      throw new InvalidEditError(
        "Choose an array position or object key for insertion."
      );
    }
    value = intent.value;
  }

  const existing = findNodeAtLocation(tree, path);
  const affectedRange = existing
    ? { from: existing.offset, to: existing.offset + existing.length }
    : { from: tree.offset, to: tree.offset + tree.length };
  const edits = modify(sourceText, path, value, {
    formattingOptions: FORMATTING_OPTIONS,
    isArrayInsertion,
  });
  return { sourceText: applyEdits(sourceText, edits), affectedRange };
};

export const compileEditIntent = (
  sourceText: string,
  intent: EditIntent
): { readonly sourceText: string; readonly affectedRange: SourceRange } => {
  const tree = parseStrictTree(sourceText);
  if (intent.type === "reorder") {
    const arrayNode = findNodeAtLocation(tree, [...intent.parentPath]);
    if (!arrayNode) {
      throw new InvalidEditError("The reorder target no longer exists.");
    }
    return {
      sourceText: reorderArray(sourceText, tree, intent),
      affectedRange: {
        from: arrayNode.offset,
        to: arrayNode.offset + arrayNode.length,
      },
    };
  }
  if (intent.type === "move") {
    const sourceNode = findNodeAtLocation(tree, [...intent.path]);
    if (!sourceNode) {
      throw new InvalidEditError("The moved subtree no longer exists.");
    }
    return {
      sourceText: moveSubtree(sourceText, tree, intent),
      affectedRange: {
        from: sourceNode.offset,
        to: sourceNode.offset + sourceNode.length,
      },
    };
  }
  return compileValueIntent(sourceText, tree, intent);
};

export class CanonicalDocument {
  #history: HistoryEntry[];
  #historyIndex = 0;
  #revision = 0;
  #savedSourceText: string;

  constructor(sourceText: string) {
    this.#history = [{ sourceText, origin: "source" }];
    this.#savedSourceText = sourceText;
  }

  get snapshot(): DocumentSnapshot {
    const current = this.#history[this.#historyIndex];
    if (!current) {
      throw new Error("Document history is empty.");
    }
    return {
      sourceText: current.sourceText,
      revision: this.#revision,
      dirty: current.sourceText !== this.#savedSourceText,
      canUndo: this.#historyIndex > 0,
      canRedo: this.#historyIndex < this.#history.length - 1,
      lastOrigin: current.origin,
    };
  }

  replaceSource(
    sourceText: string,
    origin: EditOrigin = "source"
  ): DocumentSnapshot {
    if (sourceText === this.snapshot.sourceText) {
      return this.snapshot;
    }
    this.#history = this.#history.slice(0, this.#historyIndex + 1);
    this.#history.push({ sourceText, origin });
    this.#historyIndex = this.#history.length - 1;
    this.#revision += 1;
    return this.snapshot;
  }

  applyIntent(intent: EditIntent, baseRevision: number): DocumentSnapshot {
    if (baseRevision !== this.#revision) {
      throw new StaleEditError(
        `Edit revision ${baseRevision} does not match current revision ${this.#revision}.`
      );
    }
    const transaction = compileEditIntent(this.snapshot.sourceText, intent);
    return this.replaceSource(transaction.sourceText, "graph");
  }

  undo(): DocumentSnapshot {
    if (this.#historyIndex === 0) {
      return this.snapshot;
    }
    this.#historyIndex -= 1;
    this.#revision += 1;
    return this.snapshot;
  }

  redo(): DocumentSnapshot {
    if (this.#historyIndex >= this.#history.length - 1) {
      return this.snapshot;
    }
    this.#historyIndex += 1;
    this.#revision += 1;
    return this.snapshot;
  }

  markSaved(): DocumentSnapshot {
    this.#savedSourceText = this.snapshot.sourceText;
    return this.snapshot;
  }

  reset(sourceText: string, saved = true): DocumentSnapshot {
    this.#history = [{ sourceText, origin: "source" }];
    this.#historyIndex = 0;
    this.#revision += 1;
    if (saved) {
      this.#savedSourceText = sourceText;
    }
    return this.snapshot;
  }

  currentValue(): unknown {
    return getNodeValue(parseStrictTree(this.snapshot.sourceText));
  }
}
