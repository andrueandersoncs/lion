// T5 of research/probes/exact-model/test.ts against the core source at argv[2].
import { Effect } from "effect";
const src = process.argv[2] as string;
const { run } = await import(`${src}/evaluation/evaluate.ts`);
const { stdlib } = await import(`${src}/modules/index.ts`);
let state = 0x2545f491;
const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
const decimalText = (places: number, wholeDigits: number) => { const whole = Math.floor(random() * 10 ** wholeDigits); const part = Math.floor(random() * 10 ** places).toString().padStart(places, "0"); const sign = random() < 0.5 ? "-" : ""; return `${sign}${whole}.${part}`; };
const numbers = Array.from({ length: 100_000 }, () => Number(decimalText(2, 3)));
const program = ["array/reduce", ["quote", numbers], 0, "number/add"];
let best = Infinity;
for (let i = 0; i < 7; i++) { const t = performance.now(); Effect.runSync(run(program, stdlib)); best = Math.min(best, performance.now() - t); }
console.log(best.toFixed(1));
