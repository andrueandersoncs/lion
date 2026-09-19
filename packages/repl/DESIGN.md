---
name: Lion Fold Map
description: A compact one-sheet graph workbench for editing JSON-backed Lion programs.
colors:
  warm-washi: "oklch(0.955 0.018 78)"
  clean-sheet: "oklch(0.982 0.012 82)"
  muted-sheet: "oklch(0.935 0.025 78)"
  sumi: "oklch(0.235 0.022 48)"
  muted-sumi: "oklch(0.44 0.025 55)"
  crease: "oklch(0.79 0.03 70)"
  vermilion: "oklch(0.555 0.19 35)"
  sheet-ink: "oklch(0.985 0.01 85)"
  warm-secondary: "oklch(0.9 0.04 75)"
  warm-accent: "oklch(0.91 0.055 76)"
  restrained-gold: "oklch(0.72 0.11 78)"
  destructive: "oklch(0.53 0.19 27)"
typography:
  title:
    fontFamily: "IBM Plex Sans Condensed, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans Condensed, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans Condensed, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
  code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  pill: "999px"
spacing:
  2xs: "0.125rem"
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.sheet-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-primary-small:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.sheet-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.warm-washi}"
    textColor: "{colors.sumi}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  input-standard:
    backgroundColor: "transparent"
    textColor: "{colors.sumi}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.75rem"
    height: "2.25rem"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.sumi}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  graph-node:
    backgroundColor: "{colors.clean-sheet}"
    textColor: "{colors.sumi}"
    rounded: "{rounded.xl}"
  tabs-active:
    backgroundColor: "{colors.warm-washi}"
    textColor: "{colors.sumi}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
---

# Design System: Lion Fold Map

## Overview

**Creative North Star: "One-Sheet Fold Map"**

Lion Fold Map is a compact developer workbench made from one continuous warm paper field. Its graph, inspector, outline, and result views feel like different folds of the same canonical document rather than detached dashboard cards.

The visual language is precise and tactile: vermilion marks the active sheet and executable actions, sumi carries notation, restrained gold confirms the current revision, and crisp creases separate dense working regions. Expression is concentrated in the folded graph nodes and sheet geometry while controls remain familiar and fast.

**Key Characteristics:**
- Warm washi surfaces with visible creases and sparse paper geometry.
- Compact, self-hosted workhorse typography paired with exact monospaced notation.
- Vermilion for action and selection; gold only for current-state evidence.
- Dense, resizable desktop workbench that becomes a focused tabbed sheet on narrow screens.
- Folded semantic nodes that can reveal exact JSON structure without leaving the canvas.

## Colors

The palette is a warm, restrained light scheme: paper neutrals carry the interface, sumi establishes legibility, and saturated color is reserved for state.

### Primary
- **Vermilion:** Drives the Run action, current selection, graph handles, focus, and text selection.

### Secondary
- **Warm Secondary:** Marks quiet secondary controls and status surfaces without competing with vermilion.
- **Warm Accent:** Provides hover feedback for neutral controls, breadcrumbs, and outline rows.

### Tertiary
- **Restrained Gold:** Confirms the current revision and highlights selected overview nodes.

### Neutral
- **Warm Washi:** The continuous application field and default neutral control surface.
- **Clean Sheet:** The graph-node, command, dialog, and control surface.
- **Muted Sheet:** Gutter, breadcrumb, result, and folded-detail layers.
- **Sumi:** Primary notation, labels, edges, and icon color.
- **Muted Sumi:** Secondary metadata and explanatory text.
- **Crease:** Borders, separators, resize handles, scrollbars, and graph-grid points.
- **Sheet Ink:** High-contrast copy on vermilion and destructive actions.
- **Destructive:** Invalid graph structure, errors, and irreversible actions.

### Named Rules

**The Vermilion Means Action Rule.** Vermilion identifies primary execution, current selection, and direct manipulation; it is not ambient decoration.

**The Gold Is Evidence Rule.** Gold appears only where the interface proves currency or active position, never as a second call-to-action color.

## Typography

**Display Font:** IBM Plex Sans Condensed (with sans-serif fallback)
**Body Font:** IBM Plex Sans Condensed (with sans-serif fallback)
**Label/Mono Font:** SFMono-Regular (with Consolas, Liberation Mono, Menlo, and monospace fallbacks)

**Character:** The self-hosted condensed family keeps a dense developer tool readable without feeling generic. Monospaced text is limited to expression JSON, pointers, counts, ranges, and evaluation output where exact alignment carries meaning.

### Hierarchy
- **Title** (600, 1.125rem, 1.25): Inspector headings and other local workbench titles.
- **Body** (400, 0.875rem, 1.5): Controls, pane content, messages, and primary interface copy.
- **Label** (500, 0.75rem, 1.25): Metadata, status, badges, node roles, and compact support copy.
- **Code** (400, 0.8125rem, 1.65): Expression JSON, pointers, values, counts, ranges, and rendered results.

### Named Rules

**The Workhorse and Notation Rule.** IBM Plex Sans Condensed owns interface language; the monospaced stack appears only when the content is structurally exact.

## Layout

The surface fills the dynamic viewport beneath a compact command strip. At desktop widths the graph receives 68% of the horizontal workbench and a tabbed inspector, outline, or result pane receives 32%. The split is directly resizable, and the pane boundary reads as a crease in one sheet.

The graph uses a 32px point rhythm over the continuous warm paper field. Search and selection breadcrumbs sit directly above the canvas, keeping navigation attached to the graph instead of introducing a separate card.

At 899px and below, the command strip wraps its document controls onto a second row while Open and Save remain visibly labeled, the minimap disappears, and Graph, Inspect, and Result become three mutually exclusive tabs. The graph centers the selected node at a readable scale instead of shrinking the full branch to fit. Coarse pointers receive a minimum 2.75rem target in the command strip, graph search, and outline.

### Named Rules

**The One Sheet Rule.** Major work areas meet edge to edge through dividers and resize handles; do not wrap graph, inspector, outline, or result panes in detached dashboard cards.

**The Focused Fold Rule.** Wide screens expose the graph beside one focused workbench view; narrow screens preserve the same views as one active full-height tab at a time.

## Elevation & Depth

The system is crease-first and lightly lifted. Borders, tonal sheet changes, gutters, folded corners, and resize handles establish most hierarchy. Soft shadows are reserved for the command strip, graph nodes, graph controls, and overview map; selected nodes add a vermilion ring and slightly deeper lift.

### Shadow Vocabulary

- **Command Lift** (`0 8px 24px color-mix(in oklab, var(--sumi) 8%, transparent)`): Separates the global command strip from the working sheet.
- **Map Lift** (`0 7px 18px color-mix(in oklab, var(--sumi) 11%, transparent)`): Lifts graph nodes, graph controls, and the document overview.
- **Selected Map Lift** (`0 0 0 3px color-mix(in oklab, var(--vermilion) 18%, transparent), 0 9px 24px color-mix(in oklab, var(--sumi) 13%, transparent)`): Marks the one current semantic node.

### Named Rules

**The Creases Before Lift Rule.** Use tonal layers and one-pixel crease borders for structure; add shadow only to global commands or manipulable map objects.

## Shapes

Corners are compact and consistently curved, ranging from small 0.25rem breadcrumb corners through 0.5rem controls to 0.875rem semantic nodes. Pills are reserved for status and role badges. The signature silhouette is the graph node's clipped lower-right fold, reinforced by a diagonal sheet flap and a crease line; selection uses a clear vermilion border and soft ring without adding a second edge.

### Named Rules

**The Folded Edge Rule.** A folded corner belongs to semantic graph nodes and exact-structure states, not to every container in the application.

## Components

Components are compact, tactile, and state-forward. They share the paper palette, visible focus rings, restrained curvature, and short transitions.

### Buttons
- **Shape:** Compact curved rectangle with a medium corner.
- **Primary:** Vermilion with sheet-ink text; Run uses the small 2rem treatment and stays at the upper right.
- **Hover / Focus:** Hover deepens the existing fill; keyboard focus adds a three-pixel translucent ring and ring-colored border.
- **Outline / Ghost:** Open and Save remain labeled outline commands at every width. New, undo, and redo use compact ghost treatment with warm-accent hover feedback.

### Chips
- **Style:** Role and revision badges are small pills with compact horizontal padding. Roles use a transparent crease outline; the current revision uses a gold-tinted sheet and gold border.
- **State:** Destructive and invalid states switch to the destructive role instead of borrowing vermilion action styling.

### Cards / Containers
- **Corner Style:** Semantic nodes use the largest system corner and a clipped folded edge; ordinary workbench panes remain edge-to-edge.
- **Background:** Clean sheet at rest and muted sheet when exact structure is unfolded.
- **Shadow Strategy:** Graph nodes use Map Lift; selection adds Selected Map Lift.
- **Border:** One-pixel crease border, dashed for stale or unfolded structure, destructive for invalid calls.
- **Internal Padding:** Node rows use 0.75rem horizontal and 0.5rem vertical padding.

### Inputs / Fields
- **Style:** Standard fields use a transparent sheet, crease stroke, medium corner, and compact body text. Graph search removes the inner field border and treats its full-width row as the control boundary.
- **Focus:** Ring-colored border plus a three-pixel translucent focus ring.
- **Error / Disabled:** Invalid fields switch border and ring to destructive; disabled controls retain shape while reducing opacity.

### Navigation

Graph search and horizontally scrollable breadcrumbs form the canvas navigation. Workbench tabs use a muted-sheet rail with an active warm-washi segment and soft inset lift. On narrow screens the three primary views use the same tab vocabulary across the available width.

### Folded Semantic Node

Each node exposes label, JSON pointer, semantic kind, parent role, expansion, and fold state in one compact sheet. Parent-to-child sumi edges carry role labels; quoted relationships use dashed edges, selection is vermilion, and unfolding changes the node to a muted dashed sheet without leaving the semantic map. Selection and node hover expose Replace and Add child actions, with the same non-drag operations kept in the persistent selection toolbar. Connection handles appear only on ordered child containers so every visible connector represents a valid move.


## Do's and Don'ts

### Do:
- **Do** keep graph, inspector, outline, and result visibly connected as folds of one continuous work surface.
- **Do** use vermilion for executable action, selection, focus, and direct graph manipulation.
- **Do** reserve gold for current-revision and active-position evidence.
- **Do** use monospaced type for expression JSON, pointers, ranges, counts, and evaluation output.
- **Do** preserve visible keyboard focus, reduced-motion behavior, forced-color selection outlines, and coarse-pointer targets.

### Don't:
- **Don't** introduce detached dashboard-card grids around the primary editor panes.
- **Don't** use gold as a decorative accent or competing primary action color.
- **Don't** apply folded corners to generic controls or containers; the fold communicates semantic structure.
- **Don't** reintroduce a persistent text-editor pane; keep exact JSON edits focused on the selected expression.
- **Don't** add decorative shadows where a crease border or tonal sheet change already expresses hierarchy.
