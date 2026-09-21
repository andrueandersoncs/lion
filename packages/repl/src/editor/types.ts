import type {
  SemanticKind,
  SemanticRelationship,
  SpecialFormName,
  StructuralPath,
} from "@lionlang/core/analysis/analyze";

export type ParseStatus = "valid" | "invalid-json" | "invalid-lion";
export type DiagnosticCategory =
  | "json-syntax"
  | "lion-schema"
  | "lion-structure";

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface EditorDiagnostic extends SourceRange {
  readonly category: DiagnosticCategory;
  readonly message: string;
}

export interface IndexedSemanticNode {
  readonly children: readonly string[];
  readonly diagnostic?: string;
  readonly id: string;
  readonly kind: SemanticKind;
  readonly label: string;
  readonly order: number;
  readonly parentId: string | null;
  readonly path: StructuralPath;
  readonly pointer: string;
  readonly quoted: boolean;
  readonly range: SourceRange;
  readonly relationships: readonly SemanticRelationship[];
  readonly role: string;
  readonly searchText: string;
  readonly specialForm?: SpecialFormName;
  readonly value?: boolean | null | number | string;
}

export interface GraphLayoutNode {
  readonly height: number;
  readonly id: string;
  readonly parentId: string | null;
  readonly width: number;
}

export interface DocumentProjection {
  readonly analyzedAt: number;
  readonly diagnostics: readonly EditorDiagnostic[];
  readonly nodes: readonly IndexedSemanticNode[];
  readonly revision: number;
  readonly rootId: string | null;
  readonly status: ParseStatus;
}

export interface SearchMatch {
  readonly id: string;
  readonly label: string;
  readonly pointer: string;
  readonly range: SourceRange;
}

export type EditOrigin = "source" | "graph" | "format";

export type EditIntent =
  | {
      readonly type: "replace";
      readonly path: StructuralPath;
      readonly value: unknown;
    }
  | {
      readonly type: "insert";
      readonly parentPath: StructuralPath;
      readonly index?: number;
      readonly key?: string;
      readonly value: unknown;
    }
  | {
      readonly type: "remove";
      readonly path: StructuralPath;
    }
  | {
      readonly type: "reorder";
      readonly parentPath: StructuralPath;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly type: "move";
      readonly path: StructuralPath;
      readonly targetParentPath: StructuralPath;
      readonly index?: number;
      readonly key?: string;
    };

export interface DocumentSnapshot {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly dirty: boolean;
  readonly lastOrigin: EditOrigin;
  readonly revision: number;
  readonly sourceText: string;
}

export type WorkerRequest =
  | {
      readonly type: "analyze";
      readonly requestId: number;
      readonly revision: number;
      readonly sourceText: string;
    }
  | {
      readonly type: "layout";
      readonly requestId: number;
      readonly revision: number;
      readonly nodes: readonly GraphLayoutNode[];
    };

export type WorkerResponse =
  | {
      readonly type: "analysis";
      readonly requestId: number;
      readonly projection: DocumentProjection;
    }
  | {
      readonly type: "layout";
      readonly requestId: number;
      readonly revision: number;
      readonly positions: Readonly<
        Record<string, { readonly x: number; readonly y: number }>
      >;
    }
  | {
      readonly type: "failure";
      readonly requestId: number;
      readonly revision: number;
      readonly message: string;
    };
