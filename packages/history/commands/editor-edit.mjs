/**
 * What the editor does to the text around an edit: replaces one value in
 * oddly spaced JSON and prints the text before and after. A probe's command:
 * it writes nothing.
 */
import { compileEditIntent } from "../../repl/src/editor/document.ts";

const source = '{\n\t"keep":  [1, 2],\n\t"move": [ {"x":1},   {"y" : 2} ]\n}';
const edited = compileEditIntent(source, {
  type: "replace",
  path: ["keep", 1],
  value: 9,
}).sourceText;
console.log(`before: ${JSON.stringify(source)}`);
console.log(`after replacing the 2 with 9: ${JSON.stringify(edited)}`);
