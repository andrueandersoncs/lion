import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { EditorDiagnostic, SourceRange } from "./types";

interface SourceEditorProps {
  readonly diagnostics: readonly EditorDiagnostic[];
  readonly onChange: (sourceText: string) => void;
  readonly onRedo: () => void;
  readonly onSelectionChange: (offset: number) => void;
  readonly onUndo: () => void;
  readonly selectedRange: SourceRange | null;
  readonly sourceText: string;
}

const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--sheet)",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-code)",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "16px 0 48px" },
  ".cm-gutters": {
    backgroundColor: "var(--sheet-muted)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--crease)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--gold) 12%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in oklab, var(--vermilion) 24%, transparent) !important",
    },
  ".cm-cursor": { borderLeftColor: "var(--vermilion)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--sheet-muted)",
    borderColor: "var(--crease)",
    color: "var(--muted-foreground)",
  },
  "&.cm-focused": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
});

export function SourceEditor({
  sourceText,
  diagnostics,
  selectedRange,
  onChange,
  onSelectionChange,
  onUndo,
  onRedo,
}: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialSourceRef = useRef(sourceText);
  const callbacksRef = useRef({ onChange, onSelectionChange, onUndo, onRedo });
  callbacksRef.current = { onChange, onSelectionChange, onUndo, onRedo };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const state = EditorState.create({
      doc: initialSourceRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        foldGutter(),
        json(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lintGutter(),
        keymap.of([
          {
            key: "Mod-z",
            run: () => {
              callbacksRef.current.onUndo();
              return true;
            },
          },
          {
            key: "Mod-Shift-z",
            run: () => {
              callbacksRef.current.onRedo();
              return true;
            },
          },
          indentWithTab,
          ...searchKeymap,
          ...foldKeymap,
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        theme,
        EditorView.contentAttributes.of({
          "aria-label": "Lion JSON source editor",
          spellcheck: "false",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacksRef.current.onChange(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            callbacksRef.current.onSelectionChange(
              update.state.selection.main.head
            );
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === sourceText) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: sourceText },
    });
  }, [sourceText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const nextDiagnostics: readonly Diagnostic[] = diagnostics.map(
      ({ from, to, message }) => ({
        from,
        to,
        message,
        severity: "error",
      })
    );
    view.dispatch(setDiagnostics(view.state, nextDiagnostics));
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!(view && selectedRange) || selectedRange.to > view.state.doc.length) {
      return;
    }
    view.dispatch({
      selection: EditorSelection.range(selectedRange.from, selectedRange.to),
      effects: EditorView.scrollIntoView(selectedRange.from, { y: "center" }),
    });
  }, [selectedRange]);

  return <div className="h-full min-h-0" ref={containerRef} />;
}
