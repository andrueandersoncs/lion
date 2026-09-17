import {
  analyze,
  flattenAnalysis,
  pathToPointer,
  type SemanticNode,
  type StructuralPath,
} from "@lionlang/core/analysis/analyze";
import {
  LionExpressionSchema,
  type LionExpressionType,
} from "@lionlang/core/schemas/lion-expression";
import { Schema } from "effect";
import {
  findNodeAtLocation,
  getNodeValue,
  type Node as JsonNode,
  type ParseError,
  parseTree,
  printParseErrorCode,
} from "jsonc-parser";
import type {
  DocumentProjection,
  EditorDiagnostic,
  IndexedSemanticNode,
  SearchMatch,
  SourceRange,
} from "./types";

const nodeId = (path: StructuralPath) =>
  path.length === 0 ? "$" : pathToPointer(path);

export const rangeForPath = (
  tree: JsonNode,
  path: StructuralPath
): SourceRange | null => {
  const node = findNodeAtLocation(tree, [...path]);
  return node ? { from: node.offset, to: node.offset + node.length } : null;
};

const flattenIndexed = (root: SemanticNode, tree: JsonNode) => {
  const nodes = flattenAnalysis(root);
  return nodes.map((node): IndexedSemanticNode => {
    const parentPath = node.path.slice(0, -1);
    const parent =
      node.path.length === 0 ? null : findSemanticNode(root, parentPath);
    const child = parent?.children.find(
      (item) => item.node.pointer === node.pointer
    );
    const range = rangeForPath(tree, node.path) ?? { from: 0, to: 0 };
    return {
      id: nodeId(node.path),
      parentId: node.path.length === 0 ? null : nodeId(parentPath),
      role: child?.role ?? "root",
      order: child?.order ?? 0,
      path: node.path,
      pointer: node.pointer,
      kind: node.kind,
      label: node.label,
      ...(node.value === undefined ? {} : { value: node.value }),
      ...(node.specialForm ? { specialForm: node.specialForm } : {}),
      quoted: node.quoted,
      range,
      children: node.children.map(({ node: childNode }) =>
        nodeId(childNode.path)
      ),
      relationships: node.relationships,
      ...(node.diagnostic ? { diagnostic: node.diagnostic } : {}),
      searchText: [
        node.label,
        node.pointer || "/",
        child?.role ?? "root",
        typeof node.value === "string" ? node.value : "",
      ]
        .join(" ")
        .toLocaleLowerCase(),
    };
  });
};

const findSemanticNode = (
  root: SemanticNode,
  path: StructuralPath
): SemanticNode | null => {
  let current: SemanticNode = root;
  for (const segment of path) {
    const next = current.children.find(
      ({ node }) => node.path.at(-1) === segment
    )?.node;
    if (!next) {
      return null;
    }
    current = next;
  }
  return current;
};

const jsonDiagnostics = (errors: readonly ParseError[]): EditorDiagnostic[] =>
  errors.map((error) => ({
    category: "json-syntax",
    message: printParseErrorCode(error.error),
    from: error.offset,
    to: error.offset + Math.max(1, error.length),
  }));

export const analyzeSource = (
  sourceText: string,
  revision: number
): DocumentProjection => {
  const errors: ParseError[] = [];
  const tree = parseTree(sourceText, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (!tree || errors.length > 0) {
    return {
      revision,
      status: "invalid-json",
      rootId: null,
      nodes: [],
      diagnostics: jsonDiagnostics(errors),
      analyzedAt: performance.now(),
    };
  }

  const value: unknown = getNodeValue(tree);
  if (!Schema.is(LionExpressionSchema)(value)) {
    return {
      revision,
      status: "invalid-lion",
      rootId: null,
      nodes: [],
      diagnostics: [
        {
          category: "lion-schema",
          message:
            "JSON is valid, but it contains an empty or forbidden object key.",
          from: tree.offset,
          to: tree.offset + tree.length,
        },
      ],
      analyzedAt: performance.now(),
    };
  }

  const semanticRoot = analyze(value as LionExpressionType);
  const nodes = flattenIndexed(semanticRoot, tree);
  const invalidNodes = nodes.filter(({ kind }) => kind === "invalid-call");
  if (invalidNodes.length > 0) {
    return {
      revision,
      status: "invalid-lion",
      rootId: nodeId([]),
      nodes,
      diagnostics: invalidNodes.map((node) => ({
        category: "lion-structure",
        message: node.diagnostic ?? "Invalid Lion call structure.",
        ...node.range,
      })),
      analyzedAt: performance.now(),
    };
  }

  return {
    revision,
    status: "valid",
    rootId: nodeId([]),
    nodes,
    diagnostics: [],
    analyzedAt: performance.now(),
  };
};

export const searchProjection = (
  projection: DocumentProjection,
  query: string
): readonly SearchMatch[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }
  return projection.nodes
    .filter(({ searchText }) => searchText.includes(normalized))
    .map(({ id, label, pointer, range }) => ({ id, label, pointer, range }));
};
