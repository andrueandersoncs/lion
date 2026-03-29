import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
import {
  ASCIIFont,
  Box,
  createCliRenderer,
  Input,
  InputRenderableEvents,
  Text,
} from "@opentui/core";
import { Effect } from "effect";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

const program = [
  "begin",
  [
    "define",
    "message-box",
    [
      "Box",
      {
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        border: true,
        title: "Messages",
      },
    ],
  ],
  [
    "define",
    "input-box",
    [
      "Box",
      {
        title: ["quote", "Input"],
        border: true,
      },
      [
        "Input",
        {
          placeholder: "What will you build?",
          width: "full",
          backgroundColor: "white",
        },
      ],
    ],
  ],
  ["Box", {}, ["message-box", "input-box"]],
];

const node = Effect.runSync(
  run(program, {
    ...stdlib,
    renderer,
    Box,
    Text,
    Input,
    ASCIIFont,
    InputRenderableEvents,
  })
);

renderer.root.add(node);
