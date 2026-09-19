---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

# Lion Fold Map Graph Editor

## Scope

The shipped graph-editor surface at route `/`. This brief governs the one-screen workbench that synchronizes the semantic graph, exact JSON source, inspector, outline, and evaluation result.

## Visitor Mode

Operate.

## Audience

Lion developers authoring and debugging real Lion programs directly from local JSON source. They need precision, source fidelity, keyboard efficiency, and navigation that remains useful as graphs grow.

## Job

Open a local Lion JSON file, understand its semantic shape, edit either the graph or exact source, evaluate the same revision, inspect the result, and save exact text without introducing an intermediate representation.

## Primary Task

Move confidently between semantic graph and exact JSON while preserving one canonical source revision. Run is the primary executable action and remains in the upper-right command group.

## Proof and Content

The first viewport exposes the synchronized workbench itself: visibly labeled Open and Save commands, a wide semantic fold-map canvas, exact JSON source, dense inspector, revision status, search, breadcrumbs, and evaluation controls. Folded nodes show labels, JSON pointers, parent roles, semantic kinds, direct Replace/Add child actions, and exact-structure expansion.

## Constraints

- Local files only; no account, hosted workspace, or collaboration surface.
- The JSON source is canonical and always recoverable.
- Graph and source edits must round-trip without changing program meaning or unsupported structure.
- Desktop supports simultaneous resizable graph, source, and inspector views; narrow screens preserve them as focused tabs.
- Interaction remains keyboard-accessible, touch-targeted for coarse pointers, reduced-motion aware, and legible in forced colors.

## Chosen Direction

**One-Sheet Fold Map.** One canonical JSON sheet folds between semantic graph and exact structure. The world is warm washi, vermilion active sheet, sumi notation, restrained gold, crisp creases, and compact workhorse type. It refuses a detached dashboard-card arrangement. Seed: `LION-FOLD-MAP-021`.

## Memorable Moment

A selected semantic node reads as a lifted, vermilion-registered fold in the same paper field as the exact JSON. Unfolding reveals raw structure in place, making the relationship between semantic meaning and canonical source immediately visible.

## Unresolved Decisions

No unresolved visual or route-level decisions are recorded for the shipped surface.
