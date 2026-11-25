# @lionlang/ui

Declarative, interactive, and streaming UI bindings and DOM renderer for Lion.

- **Pure Lion data:** every `ui/*` call (`ui/stack`, `ui/card`, `ui/metric`, `ui/alert`, `ui/table`, `ui/slider`, `ui/select`, `ui/toggle`, `ui/why`, `ui/proof`, ...) returns plain JSON-serializable nodes with zero DOM dependency.
- **Reactive state via Lion's logic database:** interactive controls carry quoted Lion actions (`onChange`, `onClick`) that update keyed facts and re-derive the view in memory.
- **Streaming UI:** stream newline-delimited Lion forms (`fact`, `rule`, `define`) into `createUiSession()` and re-render automatically as rules fire.

## Usage

```ts
import { Effect } from "effect";
import { createUiSession } from "@lionlang/ui";
import { renderUi } from "@lionlang/ui/dom";
import "@lionlang/ui/styles.css";

const session = createUiSession();
const tree = await Effect.runPromise(session.load(program));
renderUi(tree, container, {
  onAction: async (action, value) => {
    const next = await Effect.runPromise(session.dispatch(action, value));
    renderUi(next, container, { onAction });
  },
});
```

## Customizing CSS

`@lionlang/ui` supports three levels of styling control:

1. **CSS custom properties (`@lionlang/ui/styles.css`):** override `--lion-ui-bg`, `--lion-ui-surface`, `--lion-ui-surface-elevated`, `--lion-ui-border`, `--lion-ui-fg`, `--lion-ui-muted`, `--lion-ui-accent`, `--lion-ui-radius`, `--lion-ui-font-sans`, `--lion-ui-font-mono`, etc., or pass `theme: "light"` (`data-lion-theme="light"`).
2. **Per-slot class overrides:** pass `classes: { card: "...", button: "...", selectTrigger: "...", selectMenu: "..." }` to `renderUi()` (and optionally `unstyled: true` to omit default `lion-ui-*` classes for Tailwind or CSS Modules).
3. **Per-node classes:** any `ui/*` node accepts `{"className": "..."}` in its props.
