---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

# Lion Fold Map Graph Editor

## Scope

The shipped graph-editor surface at route `/`. This brief governs the one-screen workbench that synchronizes semantic nodes, graph navigation, and a collapsible evaluation output dock over one canonical JSON document.

## Visitor Mode

Operate.

## Audience

Lion developers authoring and debugging real Lion programs from local JSON files. They need precision, source fidelity, keyboard efficiency, and navigation that remains useful as graphs grow.

## Job

Open a local Lion JSON file, understand and edit its semantic shape, evaluate either the current revision or one expression-like subtree, inspect the result, and save exact JSON without introducing an intermediate representation.

## Primary Task

Move confidently through the semantic graph while preserving one canonical JSON revision. Run is the primary executable action and remains in the upper-right command group.

## Proof and Content

The first viewport exposes the workbench itself: visibly labeled Open and Save commands, a full-width semantic fold-map canvas, revision status, search, breadcrumbs, evaluation controls, and discoverable graph keys. Folded nodes lead with operation labels, useful semantic summaries, or native inline primitive controls. Expression-like nonprimitive nodes expose a small play action that evaluates only that subtree; definitions, syntax-only structures, quoted data, primitives, and invalid forms omit it. Edges and topology carry roles, order, and child count without repeating them inside every node; source facts remain available on hover, exact JSON unfolds in place, and selection reveals only applicable mutation actions.

## Constraints

- Local files only; no account, hosted workspace, or collaboration surface.
- The JSON source is canonical and always recoverable.
- Graph edits must round-trip without changing program meaning or unsupported structure.
- Desktop and narrow screens keep the graph as the only primary workspace; inspection lives in selected nodes, outline navigation lives in search and arrow keys, and evaluation appears in a compact bottom-edge dock that never participates in graph layout.
- Interaction remains keyboard-accessible, touch-targeted for coarse pointers, reduced-motion aware, and legible in forced colors.

## Chosen Direction

**One-Sheet Fold Map.** One canonical JSON document unfolds as a semantic graph whose editing, inspection, navigation, and evaluation stay on the canvas. The world is warm washi, vermilion active sheet, sumi notation, restrained gold, crisp creases, and compact workhorse type. It refuses detached workbench panels and dashboard-card arrangements. Seed: `LION-FOLD-MAP-021`.

## Memorable Moment

A selected semantic node reads as a lifted, vermilion-registered fold in the paper field. Unfolding reveals raw structure in place, keeping exact JSON detail attached to semantic meaning without a separate text-editor pane.

## Unresolved Decisions

No unresolved visual or route-level decisions are recorded for the shipped surface.
