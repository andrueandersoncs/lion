# LION-EDITOR-021 — Apply the One-Sheet Fold Map visual system

**Status:** Complete
**Priority:** P1  
**Depends on:** LION-EDITOR-009, LION-EDITOR-011, LION-EDITOR-015

## Outcome

Turn the approved One-Sheet Fold Map direction into a coherent production interface without obscuring developer-tool conventions.

## Scope

- Define durable tokens for the warm neutral field, vermilion active sheet, sumi notation, restrained gold emphasis, typography, line weights, elevation, and focus treatment.
- Apply one visual grammar across command strip, canvas, nodes, source workbench, inspector, dialogs, diagnostics, and result drawer.
- Use fold/crease structure to communicate semantic versus raw detail, not as decoration.
- Design semantic node families, structural slots, ports, selected/stale/error states, and edge treatments.
- Add a single spatial fold/refold motion grammar with reduced-motion behavior.
- Replace emoji and inherited React-demo identity with a deliberate Lion mark treatment using existing or authored vector assets.
- Support light and dark environmental needs only if both can preserve the chosen material world; do not ship a token-swapped generic theme.

## Acceptance criteria

- The editor remains recognizable with content removed through palette, line, type, and component grammar.
- Semantic, raw, selected, stale, invalid, running, and disabled states are distinguishable without color alone.
- Fold motion preserves selection context and never delays input.
- Stock shadcn components are adapted consistently rather than appearing as an unrelated layer.
- Dense graphs remain more legible, not more decorative.
- All shipped visual decisions are ready to document in `DESIGN.md` at release.

## Verification

- Inspect desktop and narrow screenshots containing empty, dense, invalid, selected, and evaluating states.
- Verify motion and reduced-motion paths in the browser.
- Run the Impeccable mechanical detector once after the UI is complete, not during concept work.

## Non-goals

A marketing site, literal origami instructions, generated raster imagery, or novelty textures that reduce text contrast.
