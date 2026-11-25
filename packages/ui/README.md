# @lionlang/ui

Declarative, interactive, and streaming UI bindings and DOM renderer for Lion.

- **Pure Lion data:** every `ui/*` call (`ui/stack`, `ui/card`, `ui/metric`, `ui/alert`, `ui/table`, `ui/slider`, `ui/toggle`, `ui/why`, `ui/proof`, ...) returns plain JSON-serializable nodes with zero DOM dependency.
- **Reactive state via Lion's logic database:** interactive controls carry quoted Lion actions (`onChange`, `onClick`) that update keyed facts and re-derive the view in memory.
- **Streaming UI:** stream newline-delimited Lion forms (`fact`, `rule`, `define`) into `createUiSession()` and re-render automatically as rules fire.

## Usage

```ts
import { Effect } from "effect";
import { createUiSession } from "@lionlang/ui";
import { renderUi } from "@lionlang/ui/dom";

const session = createUiSession();
const tree = await Effect.runPromise(session.load(program));
renderUi(tree, container, {
  onAction: async (action, value) => {
    const next = await Effect.runPromise(session.dispatch(action, value));
    renderUi(next, container, { onAction });
  },
});
```
