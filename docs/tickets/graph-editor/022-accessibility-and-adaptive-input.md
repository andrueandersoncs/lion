# LION-EDITOR-022 — Harden accessibility and adaptive input

**Status:** Complete
**Priority:** P0  
**Depends on:** LION-EDITOR-018, LION-EDITOR-021

## Outcome

Make every core workflow keyboard-operable, screen-reader-understandable, and usable across desktop, touch, zoom, and reduced-motion settings.

## Scope

- Target WCAG 2.2 AA for the editor surface.
- Audit names, roles, states, focus order, landmarks, dialogs, menus, tree outline, and live status announcements.
- Ensure the outline is a complete non-spatial navigation and mutation path for graph content.
- Encode edge and node meaning through labels and line treatment in addition to color.
- Support browser zoom to 200% without losing commands or document access.
- Make pointer targets usable on touch and support pan/zoom without blocking page-level accessibility gestures.
- Validate high contrast, forced colors where practical, reduced motion, and screen magnification behavior.
- Keep narrow layouts fully functional through tabs rather than shrinking the three-pane desktop layout.

## Acceptance criteria

- A keyboard-only user can new/open, navigate, edit, run, inspect, save, and recover from an error.
- Screen readers receive current selection, expansion, invalid/stale state, evaluation status, and save status without excessive announcements.
- Focus is never trapped outside a modal and always returns to a meaningful owner.
- No operation depends only on drag, hover, color, or animation.
- At 200% zoom, primary commands and current document remain reachable.
- Reduced-motion mode removes spatial interpolation without hiding state changes.

## Verification

- Complete manual keyboard and screen-reader passes on the supported browser matrix.
- Run automated accessibility scanning as a supplement, not the sole proof.
- Capture desktop, narrow, 200%-zoom, and reduced-motion evidence for the finish review.

## Non-goals

Custom assistive technology, user-remappable shortcuts, or promising support beyond the documented browser matrix.
