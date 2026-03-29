import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
// biome-ignore lint/performance/noNamespaceImport: Intentionally importing everything to passthrough to Lion
import * as OpenTUI from "@opentui/core";
import { Effect } from "effect";

const renderer = await OpenTUI.createCliRenderer({ exitOnCtrlC: true });

const program = [
  "/begin",
  [
    "/define",
    "message-box",
    [
      "object/new",
      "ScrollBoxRenderable",
      "renderer",
      {
        stickyScroll: true,
        stickyStart: "bottom",
        width: "100%",
        height: "100%",
        border: true,
        title: "Messages",
      },
    ],
  ],
  [
    "/define",
    "input-box",
    [
      "Box",
      {
        title: ["/quote", "Input"],
        border: true,
      },
      [
        "/define",
        "my-input",
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
  ],
  ["/define", "input-on", ["object/access", "my-input", "on"]],
  [
    "/define",
    "renderable-events-input",
    ["object/access", "InputRenderableEvents", "INPUT"],
  ],
  [
    "/define",
    "renderable-events-enter",
    ["object/access", "InputRenderableEvents", "ENTER"],
  ],
  [
    "/define",
    "add-message",
    [
      "/lambda",
      ["message"],
      [
        "/begin",
        [
          "/define",
          "message-box-add",
          ["func/bind", ["object/access", "message-box", "add"], "message-box"],
        ],
        ["/define", "new-message-text", ["Text", { content: "message" }]],
        ["message-box-add", "new-message-text"],
      ],
    ],
  ],
  ["input-on", "renderable-events-enter", ["func/callback", "add-message"]],
  ["Box", {}, ["input-box", "message-box"]],
];

const node = Effect.runSync(
  run(program, {
    ...stdlib,
    renderer,
    ...OpenTUI,
  })
);

renderer.root.add(node);

// renderer.console.toggle();
