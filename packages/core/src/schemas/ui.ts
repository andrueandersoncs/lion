import { Schema } from "effect";

// node types
export const UINodeTypeSchema = Schema.Literal(
	"text",
	"heading",
	"button",
	"card",
	"stack",
	"row",
	"badge",
	"separator",
	"alert",
	"skeleton",
	"progress",
	"code",
	"table",
	"input",
	"image"
);

export type UINodeType = typeof UINodeTypeSchema.Type;

// node
export interface UINode {
	readonly $ui: UINodeType;
	readonly props?: { readonly [key: string]: unknown };
	readonly children?: readonly (UINode | string | number | boolean)[];
}

const UINodeChildSchema: Schema.Schema<UINode | string | number | boolean> =
	Schema.Union(
		Schema.suspend((): Schema.Schema<UINode> => UINodeSchema),
		Schema.String,
		Schema.Number,
		Schema.Boolean
	);

export const UINodeSchema: Schema.Schema<UINode> = Schema.suspend(() =>
	Schema.Struct({
		$ui: UINodeTypeSchema,
		props: Schema.optional(
			Schema.Record({ key: Schema.String, value: Schema.Unknown })
		),
		children: Schema.optional(Schema.Array(UINodeChildSchema)),
	})
);

export type UINodeSchemaType = typeof UINodeSchema.Type;

// stream operations
export const UIStreamOperationSchema = Schema.Literal(
	"replace",
	"append",
	"update",
	"clear"
);

export type UIStreamOperation = typeof UIStreamOperationSchema.Type;

// stream message
export interface UIStreamMessage {
	readonly operation: UIStreamOperation;
	readonly target?: string;
	readonly content?: UINode;
}

export const UIStreamMessageSchema: Schema.Schema<UIStreamMessage> =
	Schema.Struct({
		operation: UIStreamOperationSchema,
		target: Schema.optional(Schema.String),
		content: Schema.optional(UINodeSchema),
	});

export type UIStreamMessageType = typeof UIStreamMessageSchema.Type;
