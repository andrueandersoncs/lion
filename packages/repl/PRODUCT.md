# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lion developers authoring and debugging real Lion programs. They are technical, work directly with JSON source, and need precision at developer-tool speed rather than a simplified no-code abstraction.

## Product Purpose

Provide a local-first graph editor for Lion programs. Users can open a Lion JSON file, edit one program through synchronized graph and JSON views, evaluate it, inspect the result, and save the same JSON representation back to disk.

Success means developers can understand and modify large Lion programs faster without losing source fidelity or needing a hosted workspace.

## Positioning

Lion programs are already JSON and homoiconic. The editor treats that source as the canonical program: the semantic graph and raw structural detail are two synchronized views of the same JSON, not a proprietary intermediate format.

## Operating Context

- Open and save local Lion JSON files in a desktop-class browser.
- Work with programs that can exceed 1,000 graph nodes.
- Edit semantic Lion expressions by default, then expand into raw JSON detail where exact structure matters.
- Evaluate explicitly by default, with an optional live-evaluation mode.

## Capabilities and Constraints

- Existing stack: React, Vite, TanStack Router, TypeScript, Effect, and the `@lionlang/core` evaluator.
- Local files only in the first release; no account, backend persistence, or collaboration.
- Graph and JSON edits must round-trip without changing program meaning or unsupported source structure.
- Large graphs require navigation, selective detail, and rendering strategies that remain responsive beyond 1,000 nodes.
- Accessibility target is WCAG 2.2 AA for keyboard, contrast, focus, names, touch targets, reduced motion, forced colors, and equivalent non-drag interactions.

## Brand Commitments

Preserve the Lion name and its identity as a JSON-based Lisp.

## Evidence on Hand

- Language semantics and examples: repository `README.md`.
- Evaluator and standard library: `packages/core`.
- Existing interactive REPL and component set: `packages/repl`.
- Existing source-as-state and JSON Patch architecture plan: `docs/plans/2026-04-18-lisp-powered-ui.md`.

No user research, usage analytics, or production-scale sample programs are currently documented; future work must not invent them.

## Product Principles

- The JSON source is canonical and always recoverable.
- Semantic assistance must never hide or rewrite valid Lion structure.
- Optimize for keyboard-driven developer workflows and rapid inspection.
- Make large programs navigable before making the canvas decorative.
- Keep the first release local-first and operationally simple.
