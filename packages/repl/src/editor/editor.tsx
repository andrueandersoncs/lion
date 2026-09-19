import { pathToPointer } from "@lionlang/core/analysis/analyze";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BracesIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  DownloadIcon,
  FileInputIcon,
  FilePlus2Icon,
  FolderOpenIcon,
  KeyboardIcon,
  KeyRoundIcon,
  PanelBottomIcon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  ReplaceIcon,
  SaveIcon,
  SearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
  Trash2Icon,
  Undo2Icon,
  WrapTextIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { searchProjection } from "./parse";
import { SemanticGraph } from "./semantic-graph";
import { SourceEditor } from "./source-editor";
import type { EditIntent, IndexedSemanticNode } from "./types";
import {
  type EditorController,
  MissingJevApiKeyError,
  useEditor,
} from "./use-editor";

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const valueAtPath = (
  sourceText: string,
  path: readonly (number | string)[]
) => {
  let value: unknown = JSON.parse(sourceText);
  for (const segment of path) {
    if (Array.isArray(value) && typeof segment === "number") {
      value = value[segment];
      continue;
    }
    if (value && typeof value === "object" && typeof segment === "string") {
      value = (value as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return value;
};

const useNarrowLayout = () => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
};

interface EditorShortcutActions {
  readonly newDocument: () => void;
  readonly onError: (error: unknown) => void;
  readonly openDocument: () => void;
  readonly openPalette: () => void;
  readonly run: () => Promise<void>;
  readonly save: () => Promise<boolean>;
  readonly saveAs: () => Promise<unknown>;
}

const useEditorShortcuts = ({
  newDocument,
  onError,
  openDocument,
  openPalette,
  run,
  save,
  saveAs,
}: EditorShortcutActions) => {
  useEffect(() => {
    const actions: Readonly<Record<string, () => Promise<unknown>>> = {
      enter: run,
      k: async () => openPalette(),
      n: async () => newDocument(),
      o: async () => openDocument(),
      s: save,
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key === "Enter" ? "enter" : event.key.toLowerCase();
      const action = key === "s" && event.shiftKey ? saveAs : actions[key];
      if (!(modifier && action)) {
        return;
      }
      event.preventDefault();
      Promise.resolve(action()).catch(onError);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newDocument, onError, openDocument, openPalette, run, save, saveAs]);
};
const CHILD_CONTAINER_KINDS: Readonly<
  Partial<Record<IndexedSemanticNode["kind"], true>>
> = {
  call: true,
  "empty-array": true,
  record: true,
  "special-form": true,
};

interface EditorCommand {
  readonly disabledReason?: string;
  readonly group: "Document" | "Edit" | "Navigate" | "Run" | "View";
  readonly icon: typeof SaveIcon;
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
  readonly shortcut?: string;
}

interface MutationDialogState {
  readonly key: string;
  readonly mode: "replace" | "insert";
  readonly source: string;
}

const EMPTY_MUTATION: MutationDialogState = {
  mode: "replace",
  source: "null",
  key: "",
};

const templateValues = [
  { label: "Value", description: "Literal null", value: "null" },
  { label: "Record", description: "Named fields", value: "{}" },
  {
    label: "Call",
    description: "Invoke a binding",
    value: '["number/add", 1, 2]',
  },
  {
    label: "Sequence",
    description: "Run in order",
    value: '["begin", null]',
  },
  {
    label: "Function",
    description: "Parameters and body",
    value: '["lambda", ["x"], "x"]',
  },
  {
    label: "Branch",
    description: "Conditional paths",
    value: '["cond", [true, null]]',
  },
] as const;

function LionMark() {
  return (
    <svg aria-label="Lion" className="lion-mark" role="img" viewBox="0 0 36 36">
      <path d="M5 5h20l6 6v20H11l-6-6V5Z" fill="currentColor" opacity=".16" />
      <path
        d="M5 5h20v6h6M5 5v20l6 6M11 31V11h20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="m15 15 7 3-7 3v-6Z" fill="currentColor" />
    </svg>
  );
}

function ToolButton({
  label,
  shortcut,
  ...props
}: React.ComponentProps<typeof Button> & {
  readonly label: string;
  readonly shortcut?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {shortcut ? <Kbd className="ml-2">{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function DocumentStatus({ editor }: { readonly editor: EditorController }) {
  const status = editor.projection.status;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="truncate font-semibold text-sm">
        {editor.fileIdentity.name}
      </p>
      {editor.snapshot.dirty ? (
        <Badge variant="secondary">Unsaved</Badge>
      ) : null}
      {status === "invalid-json" ? (
        <Badge variant="destructive">Invalid JSON</Badge>
      ) : null}
      {status === "invalid-lion" ? (
        <Badge variant="destructive">Invalid Lion</Badge>
      ) : null}
      {editor.graphStale ? (
        <Badge variant="outline">
          Graph at r{editor.graphProjection?.revision ?? "—"}
        </Badge>
      ) : null}
      {!editor.graphStale && status === "valid" ? (
        <Badge className="document-revision" variant="outline">
          Current r{editor.snapshot.revision}
        </Badge>
      ) : null}
    </div>
  );
}

function Diagnostics({ editor }: { readonly editor: EditorController }) {
  const diagnostic = editor.projection.diagnostics[0];
  if (!(diagnostic || editor.workerError)) {
    return null;
  }
  return (
    <Alert className="m-3 w-auto" variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>
        {editor.workerError
          ? "Analysis worker stopped"
          : "Source needs attention"}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{editor.workerError ?? diagnostic?.message}</span>
        {editor.workerError ? (
          <Button onClick={editor.restartWorker} size="sm" variant="outline">
            Restart analysis
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function Inspector({
  editor,
  onMutate,
  onDelete,
  onReorder,
}: {
  readonly editor: EditorController;
  readonly onMutate: (mode: "replace" | "insert") => void;
  readonly onDelete: () => void;
  readonly onReorder: (direction: -1 | 1) => void;
}) {
  const node = editor.selectedNode;
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground text-sm">
        Select a graph node or place the source cursor inside an expression.
      </div>
    );
  }
  const graphEditingDisabled = editor.graphStale;
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{node.kind}</Badge>
            {node.quoted ? <Badge variant="secondary">Quoted</Badge> : null}
          </div>
          <h2 className="mt-2 font-semibold text-lg">{node.label}</h2>
          <p className="font-mono text-muted-foreground text-xs">
            {node.pointer || "/"}
          </p>
        </div>
        <dl className="inspector-facts">
          <div>
            <dt>Source range</dt>
            <dd>
              {node.range.from}–{node.range.to}
            </dd>
          </div>
          <div>
            <dt>Parent role</dt>
            <dd>{node.role}</dd>
          </div>
          <div>
            <dt>Child order</dt>
            <dd>{node.order}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{editor.graphProjection?.revision}</dd>
          </div>
        </dl>
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={graphEditingDisabled}
            onClick={() => onMutate("replace")}
            size="sm"
            variant="outline"
          >
            <ReplaceIcon data-icon="inline-start" />
            Replace
          </Button>
          <Button
            disabled={graphEditingDisabled}
            onClick={() => onMutate("insert")}
            size="sm"
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            Add child
          </Button>
          <Button
            disabled={graphEditingDisabled || node.order <= 1}
            onClick={() => onReorder(-1)}
            size="sm"
            variant="outline"
          >
            <ArrowUpIcon data-icon="inline-start" />
            Earlier
          </Button>
          <Button
            disabled={graphEditingDisabled || !node.parentId}
            onClick={() => onReorder(1)}
            size="sm"
            variant="outline"
          >
            <ArrowDownIcon data-icon="inline-start" />
            Later
          </Button>
          <Button
            className="col-span-2"
            disabled={graphEditingDisabled || !node.parentId}
            onClick={onDelete}
            size="sm"
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            Delete subtree
          </Button>
        </div>
        {graphEditingDisabled ? (
          <p className="text-destructive text-xs">
            Graph mutations resume after the current source is valid.
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function Outline({ editor }: { readonly editor: EditorController }) {
  const nodes = editor.graphProjection?.nodes ?? [];
  const moveFocus = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    node: IndexedSemanticNode
  ) => {
    let targetIndex: number | null = null;
    if (event.key === "ArrowDown") {
      targetIndex = Math.min(nodes.length - 1, index + 1);
    } else if (event.key === "ArrowUp") {
      targetIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = nodes.length - 1;
    } else if (event.key === "ArrowLeft" && node.parentId) {
      targetIndex = nodes.findIndex(({ id }) => id === node.parentId);
    } else if (event.key === "ArrowRight" && node.children[0]) {
      targetIndex = nodes.findIndex(({ id }) => id === node.children[0]);
    }
    if (targetIndex === null || targetIndex < 0) {
      return;
    }
    event.preventDefault();
    const target = nodes[targetIndex];
    const container = event.currentTarget.parentElement;
    if (target) {
      editor.setSelectedId(target.id);
      window.requestAnimationFrame(() => {
        const element = container?.children.item(targetIndex);
        if (element instanceof HTMLElement) {
          element.focus();
        }
      });
    }
  };
  return (
    <ScrollArea className="h-full">
      <div aria-label="Semantic document outline" className="p-2" role="tree">
        {nodes.map((node, index) => (
          <button
            aria-expanded={node.children.length > 0 ? true : undefined}
            aria-level={node.path.length + 1}
            aria-selected={editor.selectedId === node.id}
            className={cn(
              "outline-row",
              editor.selectedId === node.id && "outline-row-selected"
            )}
            key={node.id}
            onClick={() => editor.setSelectedId(node.id)}
            onKeyDown={(event) => moveFocus(event, index, node)}
            role="treeitem"
            style={{
              paddingInlineStart: `${Math.min(node.path.length, 12) * 14 + 8}px`,
            }}
            tabIndex={editor.selectedId === node.id ? 0 : -1}
            type="button"
          >
            <ChevronRightIcon aria-hidden />
            <span className="truncate">{node.label}</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {node.role}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

const JevAnswerSchema = z
  .object({
    type: z.string().optional(),
    noul: z.number().optional(),
    choice: z.string().optional(),
    score: z.number().optional(),
    confidence: z.number().optional(),
    probabilities: z.record(z.string(), z.number()).optional(),
    legend: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

const JevResultSchema = z
  .object({
    model: z.string(),
    answers: z.record(z.string(), JevAnswerSchema),
    usage: z
      .object({
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

type JevAnswerValue = z.infer<typeof JevAnswerSchema>;
type JevResult = z.infer<typeof JevResultSchema>;

const asJevResult = (value: unknown): JevResult | null => {
  const parsed = JevResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const formatProbability = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);

function JevAnswer({
  answer,
  name,
}: {
  readonly answer: JevAnswerValue;
  readonly name: string;
}) {
  const type = answer.type ?? "answer";
  const confidence = answer.confidence ?? null;
  const probabilities = Object.entries(answer.probabilities ?? {});
  const legend = answer.legend;
  return (
    <section className="flex flex-col gap-3 border-crease border-b pb-4 last:border-0 last:pb-0">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">{name}</h3>
        <Badge variant="outline">{type}</Badge>
      </header>
      {typeof answer.noul === "number" ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-xs">
            True probability
          </span>
          <strong className="font-mono text-lg tabular-nums">
            {formatProbability(answer.noul)}
          </strong>
        </div>
      ) : null}
      {typeof answer.choice === "string" ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">Selected</span>
          <Badge variant="secondary">{answer.choice}</Badge>
        </div>
      ) : null}
      {typeof answer.score === "number" ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-xs">Score</span>
          <strong className="font-mono text-lg tabular-nums">
            {answer.score.toFixed(2)}
          </strong>
        </div>
      ) : null}
      {confidence === null ? null : (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-mono tabular-nums">
            {formatProbability(confidence)}
          </span>
        </div>
      )}
      {probabilities.length > 0 ? (
        <div className="flex flex-col gap-2">
          {probabilities.map(([key, probability]) => (
            <div className="flex flex-col gap-1" key={key}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  {typeof legend?.[key] === "string" ? legend[key] : key}
                </span>
                <span className="font-mono tabular-nums">
                  {formatProbability(probability)}
                </span>
              </div>
              <Progress
                aria-label={`${name}: ${key}`}
                className="h-1.5"
                value={Math.max(0, Math.min(100, probability * 100))}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function JevResultView({
  raw,
  result,
}: {
  readonly raw: string;
  readonly result: JevResult;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{result.model}</Badge>
        {result.usage?.input_tokens === undefined ? null : (
          <span className="text-muted-foreground text-xs">
            {result.usage.input_tokens} input tokens
          </span>
        )}
        {result.usage?.output_tokens === undefined ? null : (
          <span className="text-muted-foreground text-xs">
            {result.usage.output_tokens} output tokens
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {Object.entries(result.answers).map(([name, answer]) => (
          <JevAnswer answer={answer} key={name} name={name} />
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground text-xs">
          Raw JSON
        </summary>
        <pre className="result-code mt-2">{raw}</pre>
      </details>
    </div>
  );
}

function ResultPanel({ editor }: { readonly editor: EditorController }) {
  const { evaluation } = editor;
  const jevResult = asJevResult(evaluation.result);
  const copy = () => {
    navigator.clipboard
      .writeText(evaluation.error ?? evaluation.rendered)
      .then(() => toast.success("Result copied"));
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-crease border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <SquareTerminalIcon aria-hidden />
          <span className="font-semibold text-sm">Result</span>
          <Badge
            variant={evaluation.status === "failed" ? "destructive" : "outline"}
          >
            {evaluation.status}
          </Badge>
          {evaluation.stale ? <Badge variant="secondary">Stale</Badge> : null}
        </div>
        <ToolButton
          disabled={!(evaluation.error || evaluation.rendered)}
          label="Copy result"
          onClick={copy}
          size="icon-sm"
          variant="ghost"
        >
          <CopyIcon />
        </ToolButton>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {evaluation.transcript.length > 0 ? (
            <section>
              <h3 className="mb-2 font-semibold text-xs uppercase tracking-wide">
                Console
              </h3>
              <pre className="result-code">
                {evaluation.transcript.join("\n")}
              </pre>
            </section>
          ) : null}
          {evaluation.status === "idle" ? (
            <p className="text-muted-foreground text-sm">
              Run the current valid revision to inspect its result.
            </p>
          ) : null}
          {evaluation.status === "scheduled" ? (
            <p className="text-muted-foreground text-sm">
              Live evaluation scheduled after typing settles.
            </p>
          ) : null}
          {evaluation.status === "running" ? (
            <p aria-live="polite" className="text-sm">
              Evaluating revision {evaluation.revision}…
            </p>
          ) : null}
          {evaluation.error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Evaluation failed</AlertTitle>
              <AlertDescription>{evaluation.error}</AlertDescription>
            </Alert>
          ) : null}
          {jevResult ? (
            <JevResultView raw={evaluation.rendered} result={jevResult} />
          ) : null}
          {evaluation.rendered && !jevResult ? (
            <pre className="result-code">{evaluation.rendered}</pre>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function SearchBar({ editor }: { readonly editor: EditorController }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = useMemo(
    () =>
      editor.graphProjection
        ? searchProjection(editor.graphProjection, query)
        : [],
    [editor.graphProjection, query]
  );
  const reveal = (index: number) => {
    const match = matches[index];
    if (!match) {
      return;
    }
    setActiveIndex(index);
    editor.setSelectedId(match.id);
  };
  const move = (direction: -1 | 1) => {
    if (matches.length === 0) {
      return;
    }
    if (activeIndex < 0 || activeIndex >= matches.length) {
      reveal(direction === 1 ? 0 : matches.length - 1);
      return;
    }
    reveal((activeIndex + direction + matches.length) % matches.length);
  };
  const resultLabel =
    activeIndex >= 0 && activeIndex < matches.length
      ? `${activeIndex + 1} of ${matches.length}`
      : `${matches.length} match${matches.length === 1 ? "" : "es"}`;

  return (
    <div className="graph-search">
      <div className="graph-search-field">
        <SearchIcon aria-hidden />
        <Input
          aria-label="Search graph by name, value, or JSON Pointer"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              setQuery("");
              setActiveIndex(-1);
              return;
            }
            if (event.key === "Enter") {
              move(event.shiftKey ? -1 : 1);
            }
          }}
          placeholder="Search name, value, /path"
          type="search"
          value={query}
        />
      </div>
      <span aria-live="polite" className="graph-search-status">
        {query ? resultLabel : null}
      </span>
      <ToolButton
        disabled={matches.length === 0}
        label="Previous match"
        onClick={() => move(-1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowUpIcon />
      </ToolButton>
      <ToolButton
        disabled={matches.length === 0}
        label="Next match"
        onClick={() => move(1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowDownIcon />
      </ToolButton>
    </div>
  );
}

function Breadcrumbs({ editor }: { readonly editor: EditorController }) {
  const byId = new Map(
    editor.graphProjection?.nodes.map((node) => [node.id, node]) ?? []
  );
  const chain: IndexedSemanticNode[] = [];
  let current = editor.selectedNode;
  while (current) {
    chain.unshift(current);
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
  }
  return (
    <nav aria-label="Selection path" className="selection-breadcrumbs">
      {chain.map((node, index) => (
        <Fragment key={node.id}>
          {index > 0 ? <ChevronRightIcon aria-hidden /> : null}
          <button onClick={() => editor.setSelectedId(node.id)} type="button">
            {node.label}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

const getRunDisabledReason = (editor: EditorController) => {
  if (editor.evaluation.status === "running") {
    return "Evaluation already running";
  }
  if (editor.projection.status !== "valid" || editor.graphStale) {
    return "Repair source before running";
  }
  return undefined;
};

interface GraphWorkspaceProps {
  readonly editor: EditorController;
  readonly graphEditingReason?: string;
  readonly narrow: boolean;
  readonly onDelete: () => void;
  readonly onMutate: (
    mode: MutationDialogState["mode"],
    nodeId?: string
  ) => void;
  readonly onWrap: () => void;
}

function GraphWorkspace({
  editor,
  graphEditingReason,
  narrow,
  onDelete,
  onMutate,
  onWrap,
}: GraphWorkspaceProps) {
  if (!editor.graphProjection) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BracesIcon />
          </EmptyMedia>
          <EmptyTitle>Start with one Lion expression</EmptyTitle>
          <EmptyDescription>
            Repair the JSON source and the semantic graph will return here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const selectedAcceptsChildren = editor.selectedNode
    ? CHILD_CONTAINER_KINDS[editor.selectedNode.kind] === true
    : false;
  const editingDisabled = Boolean(graphEditingReason);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBar editor={editor} />
      <div className="graph-context-bar">
        <Breadcrumbs editor={editor} />
        <div
          aria-label="Selected expression actions"
          className="graph-action-group"
          role="toolbar"
        >
          <div className="graph-selection-summary">
            <span>Selected</span>
            <strong>{editor.selectedNode?.label ?? "Choose a node"}</strong>
          </div>
          <Button
            disabled={editingDisabled || !editor.selectedNode}
            onClick={() => onMutate("replace")}
            size="sm"
            variant="outline"
          >
            <ReplaceIcon data-icon="inline-start" />
            Replace
          </Button>
          <Button
            disabled={
              editingDisabled ||
              !editor.selectedNode ||
              !selectedAcceptsChildren
            }
            onClick={() => onMutate("insert")}
            size="sm"
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            Add child
          </Button>
          <Button
            disabled={editingDisabled || !editor.selectedNode}
            onClick={onWrap}
            size="sm"
            variant="outline"
          >
            <WrapTextIcon data-icon="inline-start" />
            Quote
          </Button>
          <ToolButton
            disabled={editingDisabled || !editor.selectedNode?.parentId}
            label="Delete selected subtree"
            onClick={onDelete}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2Icon />
          </ToolButton>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <SemanticGraph
          layout={editor.layout}
          narrow={narrow}
          onConstraint={toast.info}
          onEdit={(id) => onMutate("replace", id)}
          onInsert={(id) => onMutate("insert", id)}
          onIntent={editor.applyIntent}
          onSelect={editor.setSelectedId}
          projection={editor.graphProjection}
          selectedId={editor.selectedId}
          stale={editor.graphStale}
        />
      </div>
    </div>
  );
}

export function GraphEditor() {
  const editor = useEditor();
  const narrow = useNarrowLayout();
  const [activeTab, setActiveTab] = useState("graph");
  const [workbenchTab, setWorkbenchTab] = useState("inspector");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mutation, setMutation] = useState<MutationDialogState | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [jevKeyOpen, setJevKeyOpen] = useState(false);
  const [jevKeyInput, setJevKeyInput] = useState("");
  const [jevKeyError, setJevKeyError] = useState<string | null>(null);
  const [runAfterJevKey, setRunAfterJevKey] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const selectedRange = editor.selectedNode?.range ?? null;
  const graphEditingReason = editor.graphStale
    ? "Repair source before editing the graph."
    : undefined;

  const handleError = useCallback((error: unknown) => {
    if (isAbortError(error)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === "EXTERNAL_CHANGE") {
      setConflictOpen(true);
      return;
    }
    toast.error(message);
  }, []);

  const openJevKeyDialog = useCallback((runAfterSave = false) => {
    setJevKeyInput("");
    setJevKeyError(null);
    setRunAfterJevKey(runAfterSave);
    setJevKeyOpen(true);
  }, []);

  const runCurrentRevision = useCallback(async () => {
    if (editor.evaluation.status === "running") {
      return;
    }
    if (editor.jev.active && !editor.jev.configured) {
      openJevKeyDialog(true);
      return;
    }
    if (narrow) {
      setActiveTab("result");
    } else {
      setWorkbenchTab("result");
    }
    try {
      await editor.runEvaluation();
    } catch (error) {
      if (error instanceof MissingJevApiKeyError) {
        openJevKeyDialog(true);
        return;
      }
      handleError(error);
    }
  }, [editor, handleError, narrow, openJevKeyDialog]);

  useEffect(() => {
    if (!(editor.jev.configured && runAfterJevKey)) {
      return;
    }
    setRunAfterJevKey(false);
    runCurrentRevision().catch(handleError);
  }, [editor.jev.configured, handleError, runAfterJevKey, runCurrentRevision]);

  const saveJevKey = () => {
    const apiKey = jevKeyInput.trim();
    if (!apiKey) {
      setJevKeyError("Enter a TypeSafe API key.");
      return;
    }
    editor.setJevApiKey(apiKey);
    setJevKeyError(null);
    setJevKeyOpen(false);
    toast.success("TypeSafe API key ready for this tab");
  };

  const forgetJevKey = () => {
    editor.setJevApiKey(null);
    setJevKeyInput("");
    setJevKeyError(null);
    setRunAfterJevKey(false);
    setJevKeyOpen(false);
    toast.info("TypeSafe API key forgotten");
  };

  const startOpen = useCallback(async () => {
    try {
      const handled = await editor.openFile();
      if (!handled) {
        fileInputRef.current?.click();
      }
    } catch (error) {
      handleError(error);
    }
  }, [editor, handleError]);

  const guardDestructive = useCallback(
    (action: () => void | Promise<void>) => {
      if (editor.snapshot.dirty) {
        pendingActionRef.current = action;
        setUnsavedOpen(true);
        return;
      }
      Promise.resolve(action()).catch(handleError);
    },
    [editor.snapshot.dirty, handleError]
  );

  const save = useCallback(
    async (overwrite = false) => {
      try {
        const outcome = await editor.save(overwrite);
        toast.success(
          outcome === "download" ? "Downloaded a copy" : "Saved to disk"
        );
        return true;
      } catch (error) {
        handleError(error);
        return false;
      }
    },
    [editor, handleError]
  );
  const beginMutation = useCallback(
    (mode: MutationDialogState["mode"], nodeId?: string) => {
      if (nodeId) {
        editor.setSelectedId(nodeId);
      }
      setMutation({ ...EMPTY_MUTATION, mode });
      setMutationError(null);
    },
    [editor]
  );

  const applyMutation = () => {
    if (!(mutation && editor.selectedNode)) {
      return;
    }
    try {
      const value = JSON.parse(mutation.source) as unknown;
      let intent: EditIntent;
      let nextSelectionId = editor.selectedNode.id;
      if (mutation.mode === "replace") {
        intent = { type: "replace", path: editor.selectedNode.path, value };
      } else {
        const selectedValue = valueAtPath(
          editor.snapshot.sourceText,
          editor.selectedNode.path
        );
        if (Array.isArray(selectedValue)) {
          intent = {
            type: "insert",
            parentPath: editor.selectedNode.path,
            index: selectedValue.length,
            value,
          };
          nextSelectionId = pathToPointer([
            ...editor.selectedNode.path,
            selectedValue.length,
          ]);
        } else if (selectedValue && typeof selectedValue === "object") {
          intent = {
            type: "insert",
            parentPath: editor.selectedNode.path,
            key: mutation.key,
            value,
          };
          nextSelectionId = pathToPointer([
            ...editor.selectedNode.path,
            mutation.key,
          ]);
        } else {
          throw new Error("Select an array or record before adding a child.");
        }
      }
      editor.applyIntent(intent);
      editor.setSelectedId(nextSelectionId, false);
      setMutation(null);
      setMutationError(null);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteSelected = () => {
    if (!editor.selectedNode?.parentId) {
      return;
    }
    const parentId = editor.selectedNode.parentId;
    editor.applyIntent({ type: "remove", path: editor.selectedNode.path });
    editor.setSelectedId(parentId);
    setDeleteOpen(false);
  };

  const reorderSelected = (direction: -1 | 1) => {
    const selected = editor.selectedNode;
    if (!(selected?.parentId && editor.graphProjection)) {
      return;
    }
    const parent = editor.graphProjection.nodes.find(
      ({ id }) => id === selected.parentId
    );
    if (!parent) {
      return;
    }
    const target = selected.order + direction;
    if (target < 0 || target >= parent.children.length) {
      toast.info("Already at the edge of this ordered role.");
      return;
    }
    editor.applyIntent({
      type: "reorder",
      parentPath: parent.path,
      from: selected.order,
      to: target,
    });
  };

  const wrapSelected = useCallback(() => {
    if (!editor.selectedNode) {
      return;
    }
    const value = valueAtPath(
      editor.snapshot.sourceText,
      editor.selectedNode.path
    );
    editor.applyIntent({
      type: "replace",
      path: editor.selectedNode.path,
      value: ["quote", value],
    });
  }, [editor]);

  const formatDocument = useCallback(() => {
    try {
      editor.replaceSource(
        `${JSON.stringify(JSON.parse(editor.snapshot.sourceText), null, "\t")}\n`
      );
      toast.success("Document formatted");
    } catch {
      toast.error("Format requires valid JSON.");
    }
  }, [editor]);

  const commands = useMemo<readonly EditorCommand[]>(
    () => [
      {
        id: "new",
        label: "New document",
        group: "Document",
        shortcut: "⌘N",
        icon: FilePlus2Icon,
        run: () => guardDestructive(editor.newDocument),
      },
      {
        id: "open",
        label: "Open local file",
        group: "Document",
        shortcut: "⌘O",
        icon: FolderOpenIcon,
        run: () => guardDestructive(startOpen),
      },
      {
        id: "jev-playground",
        label: "Open Jev playground",
        group: "Document",
        icon: SparklesIcon,
        run: () => guardDestructive(editor.loadJevExample),
      },
      {
        id: "save",
        label: "Save",
        group: "Document",
        shortcut: "⌘S",
        icon: SaveIcon,
        run: () => {
          save().catch(handleError);
        },
      },
      {
        id: "save-as",
        label: "Save as",
        group: "Document",
        shortcut: "⇧⌘S",
        icon: DownloadIcon,
        run: () => {
          editor
            .saveAs()
            .then(() => toast.success("Saved a copy"))
            .catch(handleError);
        },
      },
      {
        id: "undo",
        label: "Undo",
        group: "Edit",
        shortcut: "⌘Z",
        icon: Undo2Icon,
        disabledReason: editor.snapshot.canUndo
          ? undefined
          : "No earlier change",
        run: editor.undo,
      },
      {
        id: "redo",
        label: "Redo",
        group: "Edit",
        shortcut: "⇧⌘Z",
        icon: Redo2Icon,
        disabledReason: editor.snapshot.canRedo ? undefined : "No later change",
        run: editor.redo,
      },
      {
        id: "replace",
        label: "Replace selected expression",
        group: "Edit",
        icon: ReplaceIcon,
        disabledReason: graphEditingReason,
        run: () => beginMutation("replace"),
      },
      {
        id: "insert",
        label: "Add child to selected expression",
        group: "Edit",
        icon: PlusIcon,
        disabledReason: graphEditingReason,
        run: () => beginMutation("insert"),
      },
      {
        id: "wrap",
        label: "Wrap selection in quote",
        group: "Edit",
        icon: WrapTextIcon,
        disabledReason: graphEditingReason,
        run: wrapSelected,
      },
      {
        id: "delete",
        label: "Delete selected subtree",
        group: "Edit",
        icon: Trash2Icon,
        disabledReason:
          graphEditingReason ??
          (editor.selectedNode?.parentId
            ? undefined
            : "The root must be replaced"),
        run: () => setDeleteOpen(true),
      },
      {
        id: "format",
        label: "Format document",
        group: "Edit",
        icon: BracesIcon,
        disabledReason:
          editor.projection.status === "invalid-json"
            ? "Repair JSON first"
            : undefined,
        run: formatDocument,
      },
      {
        id: "back",
        label: "Previous selection",
        group: "Navigate",
        shortcut: "⌃-",
        icon: ArrowLeftIcon,
        disabledReason:
          editor.selectionIndex <= 0 ? "No earlier selection" : undefined,
        run: () => editor.navigateSelection(-1),
      },
      {
        id: "forward",
        label: "Next selection",
        group: "Navigate",
        shortcut: "⌃⇧-",
        icon: ArrowRightIcon,
        disabledReason:
          editor.selectionIndex >= editor.selectionHistory.length - 1
            ? "No later selection"
            : undefined,
        run: () => editor.navigateSelection(1),
      },
      {
        id: "jev-key",
        label: editor.jev.configured
          ? "Replace TypeSafe API key"
          : "Add TypeSafe API key",
        group: "Run",
        icon: KeyRoundIcon,
        run: () => openJevKeyDialog(false),
      },
      {
        id: "run",
        label: "Run current revision",
        group: "Run",
        shortcut: "⌘↵",
        icon: PlayIcon,
        disabledReason: getRunDisabledReason(editor),
        run: () => {
          runCurrentRevision().catch(handleError);
        },
      },
      {
        id: "graph",
        label: "Show graph",
        group: "View",
        icon: SparklesIcon,
        run: () => setActiveTab("graph"),
      },
      {
        id: "source",
        label: "Show source",
        group: "View",
        icon: BracesIcon,
        run: () => setActiveTab("source"),
      },
      {
        id: "result",
        label: "Show result",
        group: "View",
        icon: PanelBottomIcon,
        run: () => setActiveTab("result"),
      },
    ],
    [
      beginMutation,
      editor,
      formatDocument,
      graphEditingReason,
      guardDestructive,
      handleError,
      openJevKeyDialog,
      runCurrentRevision,
      save,
      startOpen,
      wrapSelected,
    ]
  );

  useEditorShortcuts({
    newDocument: () => guardDestructive(editor.newDocument),
    onError: handleError,
    openDocument: () => guardDestructive(startOpen),
    openPalette: () => setPaletteOpen(true),
    run: runCurrentRevision,
    save,
    saveAs: editor.saveAs,
  });

  const graphPane = (
    <GraphWorkspace
      editor={editor}
      graphEditingReason={graphEditingReason}
      narrow={narrow}
      onDelete={() => setDeleteOpen(true)}
      onMutate={beginMutation}
      onWrap={wrapSelected}
    />
  );

  const sourcePane = (
    <div className="flex h-full min-h-0 flex-col">
      <Diagnostics editor={editor} />
      <div className="min-h-0 flex-1">
        <SourceEditor
          diagnostics={editor.projection.diagnostics}
          onChange={editor.replaceSource}
          onRedo={editor.redo}
          onSelectionChange={editor.selectAtOffset}
          onUndo={editor.undo}
          selectedRange={selectedRange}
          sourceText={editor.snapshot.sourceText}
        />
      </div>
    </div>
  );

  return (
    <main className="editor-shell" data-hydrated={hydrated}>
      <header className="command-strip">
        <div className="flex min-w-0 items-center gap-3">
          <LionMark />
          <div className="min-w-0">
            <p className="font-display font-semibold text-sm">Lion Fold Map</p>
            <DocumentStatus editor={editor} />
          </div>
        </div>
        <div
          aria-label="Document commands"
          className="command-group"
          role="toolbar"
        >
          <ToolButton
            label="New document"
            onClick={() => guardDestructive(editor.newDocument)}
            size="icon-sm"
            variant="ghost"
          >
            <FilePlus2Icon />
          </ToolButton>
          <Button
            aria-label="Open"
            onClick={() => guardDestructive(startOpen)}
            size="sm"
            variant="outline"
          >
            <FolderOpenIcon data-icon="inline-start" />
            <span className="document-action-label">Open</span>
          </Button>
          <Button
            aria-label="Save"
            disabled={!editor.snapshot.dirty}
            onClick={() => {
              save().catch(handleError);
            }}
            size="sm"
            variant="outline"
          >
            <SaveIcon data-icon="inline-start" />
            <span className="document-action-label">Save</span>
          </Button>
          <Separator orientation="vertical" />
          <ToolButton
            disabled={!editor.snapshot.canUndo}
            label="Undo"
            onClick={editor.undo}
            shortcut="⌘Z"
            size="icon-sm"
            variant="ghost"
          >
            <Undo2Icon />
          </ToolButton>
          <ToolButton
            disabled={!editor.snapshot.canRedo}
            label="Redo"
            onClick={editor.redo}
            shortcut="⇧⌘Z"
            size="icon-sm"
            variant="ghost"
          >
            <Redo2Icon />
          </ToolButton>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {editor.jev.active ? (
            <>
              <Badge variant="secondary">Jev · explicit run</Badge>
              <ToolButton
                label={
                  editor.jev.configured
                    ? "Replace TypeSafe API key"
                    : "Add TypeSafe API key"
                }
                onClick={() => openJevKeyDialog(false)}
                size="icon-sm"
                variant="ghost"
              >
                <KeyRoundIcon />
              </ToolButton>
            </>
          ) : (
            <>
              <Button
                onClick={() => guardDestructive(editor.loadJevExample)}
                size="sm"
                variant="outline"
              >
                <SparklesIcon data-icon="inline-start" />
                Jev
              </Button>
              <label
                className="flex items-center gap-2 text-xs"
                htmlFor="live-evaluation"
              >
                <span>Live</span>
                <Switch
                  checked={editor.live}
                  id="live-evaluation"
                  onCheckedChange={editor.setLive}
                />
              </label>
            </>
          )}
          <Button
            aria-busy={editor.evaluation.status === "running"}
            disabled={
              editor.evaluation.status === "running" ||
              editor.graphStale ||
              editor.projection.status !== "valid"
            }
            onClick={() => runCurrentRevision().catch(handleError)}
            size="sm"
          >
            {editor.evaluation.status === "running" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {editor.evaluation.status === "running" ? "Running…" : "Run"}
          </Button>
          <Button
            aria-label="Open command palette"
            onClick={() => setPaletteOpen(true)}
            size="sm"
            variant="outline"
          >
            <KeyboardIcon data-icon="inline-start" />
            <span className="hidden sm:inline">Commands</span>
            <Kbd>⌘K</Kbd>
          </Button>
        </div>
      </header>

      <input
        accept="application/json,.json"
        aria-label="Import Lion JSON file"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            editor.loadFile(file).catch(handleError);
          }
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />

      {narrow ? (
        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList className="mx-3 my-2 grid w-auto grid-cols-4">
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="inspect">Inspect</TabsTrigger>
            <TabsTrigger value="result">Result</TabsTrigger>
          </TabsList>
          <TabsContent className="min-h-0" value="graph">
            {graphPane}
          </TabsContent>
          <TabsContent className="min-h-0" value="source">
            {sourcePane}
          </TabsContent>
          <TabsContent className="min-h-0" value="inspect">
            <Tabs
              className="h-full"
              onValueChange={setWorkbenchTab}
              value={workbenchTab}
            >
              <TabsList className="mx-3 mt-2">
                <TabsTrigger value="inspector">Inspector</TabsTrigger>
                <TabsTrigger value="outline">Outline</TabsTrigger>
              </TabsList>
              <TabsContent value="inspector">
                <Inspector
                  editor={editor}
                  onDelete={() => setDeleteOpen(true)}
                  onMutate={beginMutation}
                  onReorder={reorderSelected}
                />
              </TabsContent>
              <TabsContent value="outline">
                <Outline editor={editor} />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent className="min-h-0" value="result">
            <ResultPanel editor={editor} />
          </TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup
          className="min-h-0 flex-1"
          orientation="horizontal"
        >
          <ResizablePanel defaultSize={62} minSize={35}>
            {graphPane}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={38} minSize={25}>
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize={58} minSize={25}>
                {sourcePane}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={42} minSize={20}>
                <Tabs
                  className="h-full gap-0"
                  onValueChange={setWorkbenchTab}
                  value={workbenchTab}
                >
                  <TabsList className="m-2">
                    <TabsTrigger value="inspector">Inspector</TabsTrigger>
                    <TabsTrigger value="outline">Outline</TabsTrigger>
                    <TabsTrigger value="result">Result</TabsTrigger>
                  </TabsList>
                  <TabsContent className="min-h-0" value="inspector">
                    <Inspector
                      editor={editor}
                      onDelete={() => setDeleteOpen(true)}
                      onMutate={beginMutation}
                      onReorder={reorderSelected}
                    />
                  </TabsContent>
                  <TabsContent className="min-h-0" value="outline">
                    <Outline editor={editor} />
                  </TabsContent>
                  <TabsContent className="min-h-0" value="result">
                    <ResultPanel editor={editor} />
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {editor.graphStale
          ? "Graph is stale; mutations and evaluation are paused."
          : `Graph current at revision ${editor.snapshot.revision}.`}
      </div>

      <CommandDialog onOpenChange={setPaletteOpen} open={paletteOpen}>
        <CommandInput placeholder="Type a command or action…" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          {(["Document", "Edit", "Navigate", "Run", "View"] as const).map(
            (group) => (
              <CommandGroup heading={group} key={group}>
                {commands
                  .filter((command) => command.group === group)
                  .map((command) => (
                    <CommandItem
                      disabled={Boolean(command.disabledReason)}
                      key={command.id}
                      onSelect={() => {
                        command.run();
                        setPaletteOpen(false);
                      }}
                      value={`${command.label} ${command.disabledReason ?? ""}`}
                    >
                      <command.icon />
                      {command.label}
                      {command.disabledReason ? (
                        <span className="ml-auto text-muted-foreground text-xs">
                          {command.disabledReason}
                        </span>
                      ) : null}
                      {!command.disabledReason && command.shortcut ? (
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
              </CommandGroup>
            )
          )}
        </CommandList>
      </CommandDialog>

      <Dialog
        onOpenChange={(open) => {
          setJevKeyOpen(open);
          if (!open) {
            setJevKeyError(null);
            setRunAfterJevKey(false);
          }
        }}
        open={jevKeyOpen}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveJevKey();
            }}
          >
            <DialogHeader>
              <DialogTitle>TypeSafe API key</DialogTitle>
              <DialogDescription>
                Connect this tab to Jev. The key stays in memory and is never
                written into the Lion document.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={Boolean(jevKeyError)}>
                <FieldLabel htmlFor="jev-api-key">
                  {editor.jev.configured ? "Replacement API key" : "API key"}
                </FieldLabel>
                <Input
                  aria-invalid={Boolean(jevKeyError)}
                  autoComplete="off"
                  id="jev-api-key"
                  onChange={(event) => {
                    setJevKeyInput(event.target.value);
                    setJevKeyError(null);
                  }}
                  placeholder="Paste your TypeSafe API key"
                  type="password"
                  value={jevKeyInput}
                />
                <FieldDescription>
                  Closing or refreshing this tab clears the credential.
                </FieldDescription>
                <FieldError>{jevKeyError}</FieldError>
              </Field>
            </FieldGroup>
            <Alert>
              <CircleAlertIcon />
              <AlertTitle>Browser credential</AlertTitle>
              <AlertDescription>
                Requests travel through this app&apos;s same-origin proxy. Use a
                scoped development key rather than a production credential.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              {editor.jev.configured ? (
                <Button onClick={forgetJevKey} type="button" variant="outline">
                  Forget key
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  setJevKeyOpen(false);
                  setJevKeyError(null);
                  setRunAfterJevKey(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button type="submit">
                {runAfterJevKey ? "Save and run" : "Save key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setMutation(null);
            setMutationError(null);
          }
        }}
        open={mutation !== null}
      >
        <DialogContent className="expression-dialog">
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              applyMutation();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {mutation?.mode === "insert"
                  ? "Add a child expression"
                  : "Replace expression"}
              </DialogTitle>
              <DialogDescription>
                Build from a Lion pattern or enter any strict JSON value. Only
                the selected source range changes.
              </DialogDescription>
            </DialogHeader>
            <section
              aria-labelledby="expression-patterns"
              className="flex flex-col gap-2"
            >
              <div>
                <h3 className="font-semibold text-sm" id="expression-patterns">
                  Start from a pattern
                </h3>
                <p className="text-muted-foreground text-xs">
                  Pick once, then refine the exact JSON below.
                </p>
              </div>
              <ToggleGroup
                aria-label="Expression pattern"
                className="expression-template-grid"
                onValueChange={(source) => {
                  if (source) {
                    setMutation((current) =>
                      current ? { ...current, source } : current
                    );
                  }
                }}
                spacing={2}
                type="single"
                value={
                  templateValues.some(({ value }) => value === mutation?.source)
                    ? mutation?.source
                    : ""
                }
                variant="outline"
              >
                {templateValues.map((template) => (
                  <ToggleGroupItem
                    aria-label={`Use ${template.label} pattern`}
                    key={template.label}
                    value={template.value}
                  >
                    <span>{template.label}</span>
                    <small>{template.description}</small>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </section>
            <FieldGroup>
              {mutation?.mode === "insert" &&
              editor.selectedNode &&
              !Array.isArray(
                valueAtPath(
                  editor.snapshot.sourceText,
                  editor.selectedNode.path
                )
              ) ? (
                <Field>
                  <FieldLabel htmlFor="expression-key">
                    Property name
                  </FieldLabel>
                  <Input
                    id="expression-key"
                    onChange={(event) =>
                      setMutation((current) =>
                        current
                          ? { ...current, key: event.target.value }
                          : current
                      )
                    }
                    placeholder="newField"
                    value={mutation.key}
                  />
                </Field>
              ) : null}
              <Field data-invalid={Boolean(mutationError)}>
                <FieldLabel htmlFor="expression-source">
                  Expression JSON
                </FieldLabel>
                <Textarea
                  aria-invalid={Boolean(mutationError)}
                  className="min-h-36 font-mono"
                  id="expression-source"
                  onChange={(event) =>
                    setMutation((current) =>
                      current
                        ? { ...current, source: event.target.value }
                        : current
                    )
                  }
                  spellCheck={false}
                  value={mutation?.source ?? ""}
                />
                <FieldDescription>
                  Canonical source remains visible and undoable after applying.
                </FieldDescription>
                <FieldError>{mutationError}</FieldError>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                onClick={() => setMutation(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button type="submit">
                <CheckIcon data-icon="inline-start" />
                {mutation?.mode === "insert" ? "Add expression" : "Replace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this subtree?</DialogTitle>
            <DialogDescription>
              The exact source range {editor.selectedNode?.range.from}–
              {editor.selectedNode?.range.to} will be removed in one undoable
              transaction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={deleteSelected} variant="destructive">
              <Trash2Icon data-icon="inline-start" />
              Delete subtree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setUnsavedOpen} open={unsavedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save the current source before replacing this document, discard
              it, or keep editing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setUnsavedOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const action = pendingActionRef.current;
                setUnsavedOpen(false);
                pendingActionRef.current = null;
                Promise.resolve(action?.()).catch(handleError);
              }}
              variant="destructive"
            >
              Discard
            </Button>
            <Button
              onClick={() => {
                save()
                  .then((saved) => {
                    if (saved) {
                      const action = pendingActionRef.current;
                      setUnsavedOpen(false);
                      pendingActionRef.current = null;
                      return action?.();
                    }
                  })
                  .catch(handleError);
              }}
            >
              <SaveIcon data-icon="inline-start" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setConflictOpen} open={conflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File changed outside Lion</DialogTitle>
            <DialogDescription>
              The backing file is newer than the version opened here. Reload it,
              overwrite it, or save the editor text to another file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConflictOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() =>
                editor
                  .reloadFile()
                  .then(() => setConflictOpen(false))
                  .catch(handleError)
              }
              variant="outline"
            >
              <FolderOpenIcon data-icon="inline-start" />
              Reload
            </Button>
            <Button
              onClick={() =>
                editor
                  .saveAs()
                  .then(() => setConflictOpen(false))
                  .catch(handleError)
              }
              variant="outline"
            >
              <FileInputIcon data-icon="inline-start" />
              Save as
            </Button>
            <Button
              onClick={() =>
                save(true).then((saved) => saved && setConflictOpen(false))
              }
            >
              <SaveIcon data-icon="inline-start" />
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
