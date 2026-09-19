---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

# Lion Fold Map Graph Editor

## Scope

The shipped graph-editor surface at route `/`. This brief governs the one-screen workbench that synchronizes the semantic graph, inspector, outline, and evaluation result over one canonical JSON document.

## Visitor Mode

Operate.

## Audience

Lion developers authoring and debugging real Lion programs from local JSON files. They need precision, source fidelity, keyboard efficiency, and navigation that remains useful as graphs grow.

## Job

Open a local Lion JSON file, understand and edit its semantic shape, evaluate the current revision, inspect the result, and save exact JSON without introducing an intermediate representation.

## Primary Task

Move confidently through the semantic graph while preserving one canonical JSON revision. Run is the primary executable action and remains in the upper-right command group.

## Proof and Content

The first viewport exposes the workbench itself: visibly labeled Open and Save commands, a wide semantic fold-map canvas, a dense tabbed inspector, revision status, search, breadcrumbs, and evaluation controls. Folded nodes show labels, JSON pointers, parent roles, semantic kinds, direct Replace/Add child actions, and exact-structure expansion.

## Constraints

- Local files only; no account, hosted workspace, or collaboration surface.
- The JSON source is canonical and always recoverable.
- Graph edits must round-trip without changing program meaning or unsupported structure.
- Desktop supports a resizable graph and tabbed inspector workbench; narrow screens preserve Graph, Inspect, and Result as focused tabs.
- Interaction remains keyboard-accessible, touch-targeted for coarse pointers, reduced-motion aware, and legible in forced colors.

## Chosen Direction

**One-Sheet Fold Map.** One canonical JSON document unfolds as a semantic graph and focused workbench views. The world is warm washi, vermilion active sheet, sumi notation, restrained gold, crisp creases, and compact workhorse type. It refuses a detached dashboard-card arrangement. Seed: `LION-FOLD-MAP-021`.

## Memorable Moment

A selected semantic node reads as a lifted, vermilion-registered fold in the paper field. Unfolding reveals raw structure in place, keeping exact JSON detail attached to semantic meaning without a separate text-editor pane.

## Unresolved Decisions

No unresolved visual or route-level decisions are recorded for the shipped surface.
