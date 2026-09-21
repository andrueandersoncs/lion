import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { makeTypeSafeBindings } from "@lionlang/typesafe-ai";
import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalDocument,
  InvalidEditError,
  StaleEditError,
  valueAtPath,
} from "./document";
import { analyzeSource } from "./parse";
import type {
  DocumentProjection,
  DocumentSnapshot,
  EditIntent,
  IndexedSemanticNode,
  WorkerResponse,
} from "./types";
import {
  createEditorWorkerClient,
  type EditorWorkerClient,
} from "./worker-client";

export const STARTER_SOURCE = `[
	"number/add",
	1,
	2
]
`;

export const JEV_STARTER_SOURCE = `[
	"typesafe/system-one",
	{
		"model": "jev-latest",
		"state": {
			"ticket": {
				"subject": "Duplicate charge",
				"message": "Help! I was charged twice and need this fixed today."
			}
		},
		"questions": {
			"urgent": [
				"typesafe/noul",
				"Does ticket.message convey urgency?",
				{
					"true": "The customer explicitly needs prompt action",
					"false": "The customer does not indicate urgency"
				}
			],
			"department": [
				"typesafe/choice",
				"Which team should handle this ticket?",
				{
					"billing": "Payments, charges, invoices, and refunds",
					"technical": "Bugs, outages, and integrations",
					"sales": "Pricing, upgrades, and new accounts"
				}
			],
			"frustration": [
				"typesafe/score",
				"How frustrated is the customer?",
				[
					"quote",
					[
						"Calm or neutral",
						"Concerned",
						"Clearly frustrated",
						"Extremely angry"
					]
				]
			]
		}
	}
]
`;

const usesTypeSafeBindings = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.startsWith("typesafe/");
  }
  if (Array.isArray(value)) {
    return value.some(usesTypeSafeBindings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(usesTypeSafeBindings);
  }
  return false;
};

const sourceUsesTypeSafeBindings = (sourceText: string): boolean => {
  try {
    return usesTypeSafeBindings(JSON.parse(sourceText));
  } catch {
    return false;
  }
};

export interface FileIdentity {
  readonly direct: boolean;
  readonly lastModified: number | null;
  readonly name: string;
}

interface WritableLike {
  close(): Promise<void>;
  write(data: string): Promise<void>;
}

export interface LionFileHandle {
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<File>;
  readonly name: string;
  queryPermission?(options: {
    readonly mode: "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(options: {
    readonly mode: "readwrite";
  }): Promise<PermissionState>;
}

interface LionWindow extends Window {
  showOpenFilePicker?(options: unknown): Promise<readonly LionFileHandle[]>;
  showSaveFilePicker?(options: unknown): Promise<LionFileHandle>;
}

export type EvaluationStatus =
  | "idle"
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface EvaluationState {
  readonly error: string | null;
  readonly rendered: string;
  readonly result: unknown;
  readonly revision: number | null;
  readonly stale: boolean;
  readonly status: EvaluationStatus;
  readonly target: {
    readonly label: string;
    readonly pointer: string;
  } | null;
  readonly transcript: readonly string[];
}

export class MissingJevApiKeyError extends Error {
  constructor() {
    super("Add a TypeSafe API key before running this Jev program.");
    this.name = "MissingJevApiKeyError";
  }
}

export interface JevState {
  readonly active: boolean;
  readonly configured: boolean;
}

export interface EditorController {
  readonly applyIntent: (intent: EditIntent) => void;
  readonly download: () => void;
  readonly evaluation: EvaluationState;
  readonly fileIdentity: FileIdentity;
  readonly graphProjection: DocumentProjection | null;
  readonly graphStale: boolean;
  readonly jev: JevState;
  readonly layout: (
    nodes: readonly { readonly id: string; readonly parentId: string | null }[]
  ) => Promise<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >;
  readonly live: boolean;
  readonly loadFile: (
    file: File,
    handle?: LionFileHandle | null
  ) => Promise<void>;
  readonly loadJevExample: () => void;
  readonly navigateSelection: (direction: -1 | 1) => void;
  readonly newDocument: () => void;
  readonly openFile: () => Promise<boolean>;
  readonly projection: DocumentProjection;
  readonly redo: () => void;
  readonly reloadFile: () => Promise<void>;
  readonly replaceSource: (sourceText: string) => void;
  readonly restartWorker: () => void;
  readonly runEvaluation: (source?: "explicit" | "live") => Promise<void>;
  readonly runExpression: (node: IndexedSemanticNode) => Promise<void>;
  readonly save: (overwrite?: boolean) => Promise<"download" | "saved">;
  readonly saveAs: () => Promise<"download" | "saved">;
  readonly selectedId: string | null;
  readonly selectedNode: IndexedSemanticNode | null;
  readonly selectionHistory: readonly string[];
  readonly selectionIndex: number;
  readonly setJevApiKey: (apiKey: string | null) => void;
  readonly setLive: (next: boolean) => void;
  readonly setSelectedId: (id: string | null, recordHistory?: boolean) => void;
  readonly snapshot: DocumentSnapshot;
  readonly undo: () => void;
  readonly workerError: string | null;
}

const INITIAL_EVALUATION: EvaluationState = {
  status: "idle",
  revision: null,
  result: null,
  rendered: "",
  error: null,
  transcript: [],
  stale: false,
  target: null,
};

const renderResult = (value: unknown): string => {
  const seen = new WeakSet<object>();
  let visited = 0;
  try {
    const result = JSON.stringify(
      value,
      (_key, item: unknown) => {
        visited += 1;
        if (visited > 2000) {
          return "[truncated]";
        }
        if (typeof item === "bigint") {
          return `${item}n`;
        }
        if (typeof item === "function") {
          return `[function ${item.name || "anonymous"}]`;
        }
        if (item && typeof item === "object") {
          if (seen.has(item)) {
            return "[circular]";
          }
          seen.add(item);
        }
        return item;
      },
      2
    );
    return result ?? String(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(value);
  }
};

const assertRunnableProjection = (
  projection: DocumentProjection,
  revision: number
) => {
  if (projection.status !== "valid" || projection.revision !== revision) {
    throw new InvalidEditError("Run requires a valid current Lion document.");
  }
};

const shouldSkipEvaluation = (
  source: "explicit" | "live",
  usesJev: boolean,
  apiKey: string | null,
  revision: number,
  lastEvaluationRevision: number | null
) => {
  if (usesJev && !apiKey) {
    throw new MissingJevApiKeyError();
  }
  return source === "live" && (usesJev || lastEvaluationRevision === revision);
};

const makeEvaluationEnvironment = (
  usesJev: boolean,
  apiKey: string | null,
  transcript: string[]
) => ({
  ...stdlib,
  ...(usesJev
    ? makeTypeSafeBindings({
        apiKey: apiKey ?? "",
        baseURL: "/api/typesafe",
        dangerouslyAllowBrowser: true,
        logLevel: "off",
      })
    : {}),
  "console/log": (message: string) => {
    transcript.push(message);
    return message;
  },
  "console/log-json": (message: unknown) => {
    const rendered = renderResult(message);
    transcript.push(rendered);
    return rendered;
  },
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message || error.name : String(error);

const initialLivePreference = () =>
  typeof localStorage === "undefined"
    ? false
    : localStorage.getItem("lion-editor-live") === "true";

export function useEditor() {
  const documentRef = useRef<CanonicalDocument | null>(null);
  if (!documentRef.current) {
    documentRef.current = new CanonicalDocument(STARTER_SOURCE);
  }
  const editorDocument = documentRef.current;
  const [snapshot, setSnapshot] = useState<DocumentSnapshot>(
    editorDocument.snapshot
  );
  const [projection, setProjection] = useState<DocumentProjection>(() =>
    analyzeSource(snapshot.sourceText, snapshot.revision)
  );
  const [lastValidProjection, setLastValidProjection] =
    useState<DocumentProjection | null>(() =>
      projection.status === "valid" ? projection : null
    );
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>("$");
  const [selectionHistory, setSelectionHistory] = useState<readonly string[]>([
    "$",
  ]);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [evaluation, setEvaluation] =
    useState<EvaluationState>(INITIAL_EVALUATION);
  const [live, setLiveState] = useState(initialLivePreference);
  const [fileIdentity, setFileIdentity] = useState<FileIdentity>({
    name: "untitled.lion.json",
    direct: false,
    lastModified: null,
  });
  const fileHandleRef = useRef<LionFileHandle | null>(null);
  const requestIdRef = useRef(0);
  const workerRef = useRef<EditorWorkerClient | null>(null);
  const evaluationIdRef = useRef(0);
  const lastEvaluationRevisionRef = useRef<number | null>(null);
  const [jevApiKey, setJevApiKeyState] = useState<string | null>(null);
  const usesJev = useMemo(
    () => sourceUsesTypeSafeBindings(snapshot.sourceText),
    [snapshot.sourceText]
  );

  if (!workerRef.current) {
    workerRef.current = createEditorWorkerClient();
  }

  useEffect(() => {
    const worker = workerRef.current ?? createEditorWorkerClient();
    workerRef.current = worker;
    const requestId = ++requestIdRef.current;
    let active = true;
    worker
      .request({
        type: "analyze",
        requestId,
        revision: snapshot.revision,
        sourceText: snapshot.sourceText,
      })
      .then((response: WorkerResponse) => {
        if (!active) {
          return;
        }
        if (
          response.type !== "analysis" ||
          response.requestId !== requestId ||
          response.projection.revision !== editorDocument.snapshot.revision
        ) {
          return;
        }
        setWorkerError(null);
        setProjection(response.projection);
        if (response.projection.status === "valid") {
          setLastValidProjection(response.projection);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setWorkerError(
            error instanceof Error ? error.message : "Analysis worker failed."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [editorDocument, snapshot.revision, snapshot.sourceText]);

  useEffect(
    () => () => {
      workerRef.current?.dispose();
      workerRef.current = null;
    },
    []
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editorDocument.snapshot.dirty) {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editorDocument]);

  useEffect(() => {
    setEvaluation((current) =>
      current.revision !== null && current.revision !== snapshot.revision
        ? { ...current, stale: true }
        : current
    );
  }, [snapshot.revision]);

  const commitSnapshot = useCallback((next: DocumentSnapshot) => {
    setSnapshot(next);
  }, []);

  const replaceSource = useCallback(
    (sourceText: string) =>
      commitSnapshot(editorDocument.replaceSource(sourceText)),
    [commitSnapshot, editorDocument]
  );

  const applyIntent = useCallback(
    (intent: EditIntent) => {
      if (
        projection.status !== "valid" ||
        projection.revision !== snapshot.revision
      ) {
        throw new StaleEditError(
          "Graph editing is paused until source is valid and current."
        );
      }
      commitSnapshot(editorDocument.applyIntent(intent, snapshot.revision));
    },
    [commitSnapshot, editorDocument, projection, snapshot.revision]
  );

  const undo = useCallback(
    () => commitSnapshot(editorDocument.undo()),
    [commitSnapshot, editorDocument]
  );
  const redo = useCallback(
    () => commitSnapshot(editorDocument.redo()),
    [commitSnapshot, editorDocument]
  );

  const setSelectedId = useCallback(
    (id: string | null, recordHistory = true) => {
      setSelectedIdState(id);
      if (!(id && recordHistory)) {
        return;
      }
      setSelectionHistory((current) => {
        const next = [...current.slice(0, selectionIndex + 1), id].slice(-80);
        setSelectionIndex(next.length - 1);
        return next;
      });
    },
    [selectionIndex]
  );

  const navigateSelection = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = Math.max(
        0,
        Math.min(selectionHistory.length - 1, selectionIndex + direction)
      );
      const nextId = selectionHistory[nextIndex];
      if (nextId) {
        setSelectionIndex(nextIndex);
        setSelectedIdState(nextId);
      }
    },
    [selectionHistory, selectionIndex]
  );

  const performEvaluation = useCallback(
    async (
      source: "explicit" | "live",
      target?: IndexedSemanticNode
    ): Promise<void> => {
      assertRunnableProjection(projection, snapshot.revision);
      const revision = snapshot.revision;
      const value = target
        ? valueAtPath(snapshot.sourceText, target.path)
        : (JSON.parse(snapshot.sourceText) as unknown);
      const evaluationUsesJev = usesTypeSafeBindings(value);
      if (
        shouldSkipEvaluation(
          source,
          evaluationUsesJev,
          jevApiKey,
          revision,
          lastEvaluationRevisionRef.current
        )
      ) {
        return;
      }
      lastEvaluationRevisionRef.current = revision;
      const evaluationId = ++evaluationIdRef.current;
      const transcript: string[] = [];
      const evaluationTarget = target
        ? { label: target.label, pointer: target.pointer }
        : null;
      setEvaluation({
        status: "running",
        revision,
        result: null,
        rendered: "",
        error: null,
        transcript,
        stale: false,
        target: evaluationTarget,
      });
      try {
        const environment = makeEvaluationEnvironment(
          evaluationUsesJev,
          jevApiKey,
          transcript
        );
        const result = await Effect.runPromise(run(value, environment));
        if (evaluationId !== evaluationIdRef.current) {
          return;
        }
        setEvaluation({
          status: "succeeded",
          revision,
          result,
          rendered: renderResult(result),
          error: null,
          transcript: [...transcript],
          stale: editorDocument.snapshot.revision !== revision,
          target: evaluationTarget,
        });
      } catch (error) {
        if (evaluationId !== evaluationIdRef.current) {
          return;
        }
        setEvaluation({
          status: "failed",
          revision,
          result: null,
          rendered: "",
          error: errorMessage(error),
          transcript: [...transcript],
          stale: editorDocument.snapshot.revision !== revision,
          target: evaluationTarget,
        });
      }
    },
    [
      editorDocument,
      jevApiKey,
      projection,
      snapshot.revision,
      snapshot.sourceText,
    ]
  );
  const runEvaluation = useCallback(
    (source: "explicit" | "live" = "explicit") => performEvaluation(source),
    [performEvaluation]
  );
  const runExpression = useCallback(
    (node: IndexedSemanticNode) => performEvaluation("explicit", node),
    [performEvaluation]
  );

  useEffect(() => {
    if (
      !live ||
      usesJev ||
      projection.status !== "valid" ||
      window.document.hidden
    ) {
      return;
    }
    setEvaluation((current) => ({
      ...current,
      status: "scheduled",
      target: null,
    }));
    const timer = window.setTimeout(() => {
      runEvaluation("live").catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [live, projection.status, runEvaluation, usesJev]);

  const setLive = useCallback((next: boolean) => {
    setLiveState(next);
    localStorage.setItem("lion-editor-live", String(next));
    if (!next) {
      evaluationIdRef.current += 1;
      setEvaluation((current) =>
        current.status === "scheduled" || current.status === "running"
          ? { ...current, status: "canceled" }
          : current
      );
    }
  }, []);

  const setJevApiKey = useCallback((apiKey: string | null) => {
    const normalized = apiKey?.trim() ?? "";
    setJevApiKeyState(normalized || null);
  }, []);

  const loadFile = useCallback(
    async (file: File, handle: LionFileHandle | null = null) => {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("This file exceeds the 10 MB local editor limit.");
      }
      const sourceText = await file.text();
      if (sourceText.includes("\uFFFD")) {
        throw new Error(
          "The file contains invalid UTF-8 bytes. Re-export it as UTF-8 before editing."
        );
      }
      commitSnapshot(editorDocument.reset(sourceText, true));
      fileHandleRef.current = handle;
      setFileIdentity({
        name: file.name || handle?.name || "untitled.lion.json",
        direct: handle !== null,
        lastModified: file.lastModified || null,
      });
      setSelectedId("$", false);
    },
    [commitSnapshot, editorDocument, setSelectedId]
  );

  const newDocument = useCallback(() => {
    commitSnapshot(editorDocument.reset(STARTER_SOURCE, true));
    fileHandleRef.current = null;
    setFileIdentity({
      name: "untitled.lion.json",
      direct: false,
      lastModified: null,
    });
    setSelectedId("$", false);
  }, [commitSnapshot, editorDocument, setSelectedId]);

  const loadJevExample = useCallback(() => {
    commitSnapshot(editorDocument.reset(JEV_STARTER_SOURCE, true));
    fileHandleRef.current = null;
    setFileIdentity({
      name: "jev-playground.lion.json",
      direct: false,
      lastModified: null,
    });
    setSelectedId("$", false);
  }, [commitSnapshot, editorDocument, setSelectedId]);

  const openFile = useCallback(async () => {
    const picker = (window as LionWindow).showOpenFilePicker;
    if (!picker) {
      return false;
    }
    const [handle] = await picker({
      types: [
        {
          description: "Lion JSON",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });
    if (!handle) {
      return true;
    }
    await loadFile(await handle.getFile(), handle);
    return true;
  }, [loadFile]);
  const reloadFile = useCallback(async () => {
    const handle = fileHandleRef.current;
    if (!handle) {
      throw new Error(
        "This imported document has no direct backing file to reload."
      );
    }
    await loadFile(await handle.getFile(), handle);
  }, [loadFile]);

  const download = useCallback(() => {
    const blob = new Blob([editorDocument.snapshot.sourceText], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = fileIdentity.name;
    anchor.click();
    URL.revokeObjectURL(url);
    commitSnapshot(editorDocument.markSaved());
  }, [commitSnapshot, editorDocument, fileIdentity.name]);

  const writeHandle = useCallback(
    async (handle: LionFileHandle, overwrite = false) => {
      const permission = await handle.queryPermission?.({ mode: "readwrite" });
      if (permission === "denied") {
        const requested = await handle.requestPermission?.({
          mode: "readwrite",
        });
        if (requested !== "granted") {
          throw new Error(
            "Write permission was denied; the document remains unsaved."
          );
        }
      }
      const backingFile = await handle.getFile();
      if (
        !overwrite &&
        fileIdentity.lastModified !== null &&
        backingFile.lastModified !== fileIdentity.lastModified
      ) {
        throw new Error("EXTERNAL_CHANGE");
      }
      const writable = await handle.createWritable();
      await writable.write(editorDocument.snapshot.sourceText);
      await writable.close();
      const updated = await handle.getFile();
      fileHandleRef.current = handle;
      setFileIdentity({
        name: handle.name,
        direct: true,
        lastModified: updated.lastModified,
      });
      commitSnapshot(editorDocument.markSaved());
    },
    [commitSnapshot, editorDocument, fileIdentity.lastModified]
  );

  const saveAs = useCallback(async () => {
    const picker = (window as LionWindow).showSaveFilePicker;
    if (!picker) {
      download();
      return "download" as const;
    }
    const handle = await picker({
      suggestedName: fileIdentity.name,
      types: [
        {
          description: "Lion JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    await writeHandle(handle, true);
    return "saved" as const;
  }, [download, fileIdentity.name, writeHandle]);

  const save = useCallback(
    async (overwrite = false) => {
      const handle = fileHandleRef.current;
      if (!handle) {
        return saveAs();
      }
      await writeHandle(handle, overwrite);
      return "saved" as const;
    },
    [saveAs, writeHandle]
  );

  const layout = useCallback(
    async (
      nodes: readonly {
        readonly id: string;
        readonly parentId: string | null;
      }[]
    ) => {
      const worker = workerRef.current;
      if (!worker) {
        return {};
      }
      const requestId = ++requestIdRef.current;
      const revision = editorDocument.snapshot.revision;
      const response = await worker.request({
        type: "layout",
        requestId,
        revision,
        nodes,
      });
      if (
        response.type !== "layout" ||
        response.revision !== editorDocument.snapshot.revision
      ) {
        return {};
      }
      return response.positions;
    },
    [editorDocument]
  );

  const restartWorker = useCallback(() => {
    workerRef.current?.restart();
    setWorkerError(null);
    setSnapshot({ ...editorDocument.snapshot });
  }, [editorDocument]);

  const graphProjection =
    projection.status === "valid" ? projection : lastValidProjection;
  const selectedNode = useMemo<IndexedSemanticNode | null>(
    () => graphProjection?.nodes.find(({ id }) => id === selectedId) ?? null,
    [graphProjection, selectedId]
  );

  return {
    snapshot,
    projection,
    graphProjection,
    graphStale:
      projection.status !== "valid" ||
      projection.revision !== snapshot.revision,
    workerError,
    restartWorker,
    layout,
    selectedId,
    selectedNode,
    setSelectedId,
    selectionHistory,
    selectionIndex,
    navigateSelection,
    replaceSource,
    applyIntent,
    undo,
    redo,
    evaluation,
    runEvaluation,
    runExpression,
    jev: {
      active: usesJev,
      configured: jevApiKey !== null,
    },
    setJevApiKey,
    loadJevExample,
    live,
    setLive,
    fileIdentity,
    loadFile,
    newDocument,
    openFile,
    reloadFile,
    save,
    saveAs,
    download,
  };
}
