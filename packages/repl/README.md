# Lion Fold Map

Local-first semantic graph editor for Lion programs. The JSON document remains canonical; graph, outline, inspector, and result views derive from the same revision.

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
2. Select graph or outline nodes and mutate them through direct actions or **Inspector**. Every accepted edit is one undoable document transaction.
3. Use **Run** to evaluate the current valid revision. Local standard-library programs can use **Live** after a short debounce.
4. Use **Jev** to load a TypeSafe System One starter program. The first run requests a TypeSafe API key, keeps it only in tab memory, and renders model, usage, confidence, score, and probability details. Jev programs are always explicit-run to prevent accidental network requests.
5. Save through the original file handle where supported. Otherwise **Save** downloads the exact JSON document.

Unsaved edits are guarded before New/Open and page exit. An externally changed file prompts for Reload, Save As, Overwrite, or Cancel rather than silently replacing either version.

## Keyboard

- `⌘/Ctrl+S`: save
- `⌘/Ctrl+O`: open
- `⌘/Ctrl+Enter`: run
- `⌘/Ctrl+K`: command palette
- `⌘/Ctrl+Z`, `⌘/Ctrl+Shift+Z`: shared undo/redo
- `⌘/Ctrl+F`: search the graph
- Arrow keys, Home, End: navigate the outline tree
- Enter/Space: select an outline node or activate a focused command

## Architecture

- `src/editor/document.ts`: canonical text revisions and shared undo/redo
- `src/editor/parse.ts`: strict JSON parsing, source ranges, diagnostics, and searchable projections
- `src/editor/editor.worker.ts`: revisioned semantic analysis and ELK layout off the main thread
- `src/editor/semantic-graph.tsx`: bounded React Flow rendering, folding, and semantic edges
- `src/editor/use-editor.ts`: file, evaluation, selection, and worker orchestration

The browser worker rejects stale revisions; invalid source keeps the last valid graph visibly stale. Graph edits compile to minimal `jsonc-parser` text edits, with exact subtree bytes preserved for reorder and move operations.

## Browser limits

- Chromium browsers provide the complete open/save-handle workflow.
- Other current browsers use import and download fallback without persistent file permissions.
- Files above 10 MiB are rejected before parsing.
- The first release is single-user and local-first. Jev support sends requests through the app's same-origin proxy with a user-provided, preferably scoped development key that remains in browser memory; it has no cloud persistence, collaboration, plugins, or general custom-environment editor.
