/**
 * What the website's evaluator gives for a source, as the worker and the
 * docs build call it. A probe's command: it writes nothing.
 */
import { evaluateSource } from "../../site-runtime/src/evaluate.ts";

for (const source of [
  '["number/plus", 1, 2]',
  '["begin", ["console/log", "counting"], ["number/add", 1, 2]]',
  '["number/divide", 1, 0]',
]) {
  const { ms, ...shown } = await evaluateSource({ id: 0, source });
  console.log(`${source} gives ${JSON.stringify(shown)}`);
}
