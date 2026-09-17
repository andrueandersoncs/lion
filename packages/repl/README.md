# Lion Fold Map

Local-first semantic graph and JSON editor for Lion programs. The JSON source is canonical; graph, outline, inspector, and result views derive from the same revision.

## Develop

From the repository root:

```bash
bun install
bun run prepare
bun run dev --filter=@lionlang/repl
```

Open `http://localhost:3000`.

Verification commands:

```bash
bun run typecheck --filter=@lionlang/repl
bun run test --filter=@lionlang/repl
bun run build --filter=@lionlang/repl
bun run --filter=@lionlang/repl test:e2e
```

## Workflow

1. Open a `.json` Lion program with **Open**. Browsers without the File System Access API use the file picker import path.
2. Edit exact JSON in **Source**, or select graph/outline nodes and mutate them through **Inspector**. Every accepted edit is one shared source transaction.
3. Use **Run** to evaluate the current valid revision against `@lionlang/core`'s standard library. **Live** reruns after a short debounce.
4. Save through the original file handle where supported. Otherwise **Save** downloads the exact source text. Invalid source remains savable.

Unsaved edits are guarded before New/Open and page exit. An externally changed file prompts for Reload, Save As, Overwrite, or Cancel rather than silently replacing either version.

## Keyboard

- `⌘/Ctrl+S`: save
- `⌘/Ctrl+O`: open
- `⌘/Ctrl+Enter`: run
- `⌘/Ctrl+K`: command palette
- `⌘/Ctrl+Z`, `⌘/Ctrl+Shift+Z`: shared undo/redo
- `⌘/Ctrl+F`: source or graph search, based on focus
- Arrow keys, Home, End: navigate the outline tree
- Enter/Space: select an outline node or activate a focused command

## Architecture

- `src/editor/document.ts`: canonical text revisions and shared undo/redo
- `src/editor/parse.ts`: strict JSON parsing, source ranges, diagnostics, and searchable projections
- `src/editor/editor.worker.ts`: revisioned semantic analysis and ELK layout off the main thread
- `src/editor/semantic-graph.tsx`: bounded React Flow rendering, folding, and semantic edges
- `src/editor/source-editor.tsx`: CodeMirror JSON workbench
- `src/editor/use-editor.ts`: file, evaluation, selection, and worker orchestration

The browser worker rejects stale revisions; invalid source keeps the last valid graph visibly stale. Graph edits compile to minimal `jsonc-parser` text edits, with exact subtree bytes preserved for reorder and move operations.

## Browser limits

- Chromium browsers provide the complete open/save-handle workflow.
- Other current browsers use import and download fallback without persistent file permissions.
- Files above 10 MiB are rejected before parsing.
- The first release is single-user, local-only, and standard-library-only. It has no tracing, cloud persistence, collaboration, plugins, or custom evaluation environment editor.
