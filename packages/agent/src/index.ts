import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
import {
  ASCIIFont,
  Box,
  createCliRenderer,
  Text,
  TextAttributes,
} from "@opentui/core";
import { Effect } from "effect";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

const program = [
  "begin",
  [
    ["func/jsBind", ["object/access", "renderer", "on"], "renderer"],
    "focus",
    "logFocus",
  ],
  [
    "Box",
    { alignItems: "center", justifyContent: "center", flexGrow: 1 },
    [
      "Box",
      { justifyContent: "center", alignItems: "flex-end" },
      ["ASCIIFont", { font: "tiny", text: "OpenTUI" }],
      [
        "Text",
        { content: "What will you build?", attributes: TextAttributes.DIM },
      ],
    ],
  ],
];

const node = Effect.runSync(
  run(program, {
    ...stdlib,
    renderer,
    logFocus: () => Effect.succeed(console.log("focus")),
    Box: (...args: Parameters<typeof Box>) => Effect.succeed(Box(...args)),
    Text: (...args: Parameters<typeof Text>) => Effect.succeed(Text(...args)),
    ASCIIFont: (...args: Parameters<typeof ASCIIFont>) =>
      Effect.succeed(ASCIIFont(...args)),
  })
);

renderer.root.add(node);

renderer.keyInput.on("keypress", (key) => {
  // Toggle with backtick key
  renderer.console.toggle();

  // Or with a modifier
  if (key.ctrl && key.name === "l") {
    renderer.console.toggle();
  }
});
