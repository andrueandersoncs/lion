# LION-EDITOR-015 — Implement semantic unfold and refold

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-010, LION-EDITOR-011, LION-EDITOR-013

## Outcome

Deliver the product's signature interaction: reveal exact raw JSON structure from a semantic expression and return to the semantic view without changing source.

## Scope

- Define semantic, structural, and mixed detail levels per visible subtree.
- Unfold calls and special forms into ordered array slots with operator, argument, and branch roles.
- Unfold records into ordered key/value structure and primitives into exact source tokens.
- Preserve selection and spatial context through the transition.
- Support double-click, explicit control, and keyboard commands.
- Refold only when the structural subtree maps to a valid semantic node; otherwise retain structural detail with a diagnostic.
- Respect reduced-motion preferences with an immediate state change.

## Acceptance criteria

- Unfolding exposes every source element exactly once and in source order.
- Refolding produces no source transaction and cannot change semantics.
- Mixed detail permits one raw subtree inside an otherwise semantic graph.
- Quote, cond, match, lambda, records, calls, and primitive roots unfold correctly.
- Selection remains on the corresponding source element through both transitions.
- Invalid structural edits do not disappear behind a semantic refold.

## Verification

- Exercise unfold/refold for every supported form and nested mixed-detail combination.
- Compare the unfolded representation with exact source paths and tokens.
- Verify both animated and reduced-motion behavior in the browser.

## Non-goals

Mutation gestures, per-node evaluation, decorative paper simulation, or persistent detail state across unrelated files.
