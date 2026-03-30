import { createFireworks } from "@ai-sdk/fireworks";
import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
// biome-ignore lint/performance/noNamespaceImport: Intentionally importing everything to passthrough to Lion
import * as OpenTUI from "@opentui/core";
// biome-ignore lint/performance/noNamespaceImport: Pass through to Lion
import * as AI from "ai";
import { Effect } from "effect";
import { z } from "zod";

const fireworks = createFireworks({
  apiKey: process.env.FIREWORKS_API_KEY,
});

const model = fireworks("accounts/fireworks/routers/kimi-k2p5-turbo");

const renderer = await OpenTUI.createCliRenderer({ exitOnCtrlC: true });

const program = [
  "/begin",
  ["/define", "()", "object/call-method"],
  ["/define", ".", "object/get-path"],
  [
    "/define",
    "message-box",
    [
      "object/new",
      [".", "OpenTUI", "ScrollBoxRenderable"],
      "renderer",
      {
        stickyScroll: true,
        stickyStart: "bottom",
        width: "100%",
        height: "100%",
        border: true,
        title: "Messages",
        padding: 1,
        gap: 4,
      },
    ],
  ],
  [
    "/define",
    "input-box",
    [
      [".", "OpenTUI", "Box"],
      {
        border: true,
      },
      [
        "/define",
        "my-input",
        [
          [".", "OpenTUI", "Input"],
          {
            placeholder: "Type your message to Lion Agent here...",
            width: "full",
          },
        ],
      ],
    ],
  ],
  [
    "/define",
    "renderable-events-enter",
    [".", "OpenTUI", "InputRenderableEvents.ENTER"],
  ],
  [
    "/define",
    "file-read-tool",
    [
      "()",
      "AI",
      "tool",
      {
        description: "Read a file",
        inputSchema: ["()", "Zod", "object", { path: ["()", "Zod", "string"] }],
        execute: [
          "func/callback",
          ["/lambda", ["path"], ["()", "fs", "readFile", "path", "utf8"]],
        ],
      },
    ],
  ],
  [
    "/define",
    "on-user-submit",
    [
      "/lambda",
      ["message"],
      [
        "/begin",
        [
          "/define",
          "user-message-text",
          [
            "()",
            "OpenTUI",
            "Box",
            {
              border: true,
              title: "User",
            },
            ["()", "OpenTUI", "Text", { content: "message" }],
          ],
        ],
        ["()", "message-box", "add", "user-message-text"],
        [
          "()",
          [
            "()",
            "AI",
            "generateText",
            {
              model: "model",
              prompt: "message",
              // tools: { "read-file": "fileReadTool" },
            },
          ],
          "then",
          [
            "func/callback",
            [
              "/lambda",
              ["response"],
              [
                "()",
                "message-box",
                "add",
                [
                  "()",
                  "OpenTUI",
                  "Box",
                  {
                    border: true,
                    title: "Assistant",
                  },
                  [
                    "()",
                    "OpenTUI",
                    "Text",
                    { content: [".", "response", "text"] },
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ],
  ],
  [
    "()",
    "my-input",
    "on",
    "renderable-events-enter",
    ["func/callback", "on-user-submit"],
  ],
  ["()", "OpenTUI", "Box", {}, ["message-box", "input-box"]],
];

// const submit = (message: string) => {};

const node = Effect.runSync(
  run(program, {
    ...stdlib,
    renderer,
    OpenTUI,
    model,
    AI,
    Zod: z,
  })
);

renderer.root.add(node);

// renderer.console.toggle();
