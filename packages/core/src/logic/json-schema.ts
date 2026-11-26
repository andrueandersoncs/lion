/**
 * Compiles Lion schemas and `LogicDatabase` ontologies into standard JSON
 * Schema (Draft 2020-12) suitable for OpenAI/Anthropic/Gemini structured
 * outputs and grammar-constrained decoding.
 *
 * Handles primitive predicates (`value/*`), literal data schemas, exact and
 * open records/tuples (`schema/open`), optional fields (`schema/optional`),
 * unions (`schema/anyOf`), intersections (`schema/allOf`), bounded arrays
 * (`schema/arrayOf`), dictionary records (`schema/recordOf`), and recursive
 * or mutually recursive named schemas via `$defs` / `$ref`.
 */
import type { LogicDatabase } from "@/logic/database";
import { buildOf, isPlainObject, nameOf, schemaOf } from "@/logic/terms";
import { decimalDigits, Exact } from "@/numbers/exact";

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToJsonSchemaOptions {
  /** Include `"$schema": "https://json-schema.org/draft/2020-12/schema"`. */
  readonly includeDraftHeader?: boolean;
}

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

const VALUE_PREDICATE_MAP: Readonly<Record<string, JsonSchema>> = {
  "value/any?": {},
  "value/array?": { type: "array" },
  "value/boolean?": { type: "boolean" },
  "value/integer?": { type: "integer" },
  "value/null?": { type: "null" },
  "value/number?": { type: "number" },
  "value/object?": { type: "object" },
  "value/string?": { type: "string" },
};

const toJsonLiteral = (value: unknown): unknown => {
  if (value instanceof Exact) {
    const digits = decimalDigits(value);
    return digits === undefined
      ? Number(value.n) / Number(value.d)
      : Number(digits);
  }
  if (Array.isArray(value)) {
    return value.map(toJsonLiteral);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJsonLiteral(v)])
    );
  }
  return value;
};

const isOptionalSchema = (
  schema: unknown
): { readonly inner: unknown } | undefined => {
  const built = buildOf(schema);
  if (built !== undefined && nameOf(built.by) === "schema/optional") {
    return { inner: built.args[0] };
  }
  return undefined;
};

interface Context {
  readonly defs: Record<string, JsonSchema>;
  readonly visiting: Set<string>;
}

const isLiteralConstant = (schema: JsonSchema): boolean =>
  Object.keys(schema).length === 1 && "const" in schema;

const compileRecordSchema = (
  record: Record<string, unknown>,
  ctx: Context,
  additionalProperties: boolean | JsonSchema
): JsonSchema => {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, fieldSchema] of Object.entries(record)) {
    const opt = isOptionalSchema(fieldSchema);
    if (opt === undefined) {
      properties[key] = compileSchema(fieldSchema, ctx);
      required.push(key);
    } else {
      properties[key] = compileSchema(opt.inner, ctx);
    }
  }
  return {
    additionalProperties,
    properties,
    ...(required.length > 0 ? { required } : {}),
    type: "object",
  };
};

const compileTupleSchema = (
  items: readonly unknown[],
  ctx: Context,
  rest: boolean | JsonSchema
): JsonSchema => {
  const prefixItems = items.map((item) => compileSchema(item, ctx));
  if (rest === false) {
    return {
      items: false,
      maxItems: items.length,
      minItems: items.length,
      ...(prefixItems.length > 0 ? { prefixItems } : {}),
      type: "array",
    };
  }
  return {
    items: rest,
    minItems: items.length,
    ...(prefixItems.length > 0 ? { prefixItems } : {}),
    type: "array",
  };
};

const compileOpen = (args: readonly unknown[], ctx: Context): JsonSchema => {
  const [head, rest] = args;
  const resolvedHead = schemaOf(head)?.shape ?? head;
  const restSchema: boolean | JsonSchema =
    rest === undefined ? true : compileSchema(rest, ctx);
  if (Array.isArray(resolvedHead)) {
    return compileTupleSchema(resolvedHead, ctx, restSchema);
  }
  if (isPlainObject(resolvedHead)) {
    // If `rest` is itself a record schema, merge both records cleanly.
    const resolvedRest = schemaOf(rest)?.shape ?? rest;
    if (isPlainObject(resolvedRest)) {
      return compileRecordSchema(
        { ...resolvedRest, ...resolvedHead },
        ctx,
        false
      );
    }
    return compileRecordSchema(resolvedHead, ctx, restSchema);
  }
  return {};
};

const compileBuiltSchema = (
  fnName: string,
  args: readonly unknown[],
  ctx: Context
): JsonSchema => {
  switch (fnName) {
    case "schema/anyOf": {
      const variants = args.map((part) => compileSchema(part, ctx));
      if (variants.length > 0 && variants.every(isLiteralConstant)) {
        return { enum: variants.map((v) => v.const) };
      }
      return { anyOf: variants };
    }
    case "schema/allOf":
      return { allOf: args.map((part) => compileSchema(part, ctx)) };
    case "schema/arrayOf": {
      const [item, maxItems] = args;
      return {
        items: compileSchema(item, ctx),
        ...(typeof maxItems === "number" ? { maxItems } : {}),
        type: "array",
      };
    }
    case "schema/recordOf":
      return {
        additionalProperties: compileSchema(args[0], ctx),
        type: "object",
      };
    case "schema/optional":
      return compileSchema(args[0], ctx);
    case "schema/open":
      return compileOpen(args, ctx);
    default:
      return {};
  }
};

const compileSchema = (schema: unknown, ctx: Context): JsonSchema => {
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (!(ctx.visiting.has(named.name) || named.name in ctx.defs)) {
      ctx.visiting.add(named.name);
      ctx.defs[named.name] = compileSchema(named.shape, ctx);
      ctx.visiting.delete(named.name);
    }
    return { $ref: `#/$defs/${named.name}` };
  }

  const built = buildOf(schema);
  if (built !== undefined) {
    const fnName = nameOf(built.by);
    if (fnName !== undefined) {
      return compileBuiltSchema(fnName, built.args, ctx);
    }
  }

  if (typeof schema === "function") {
    const fnName = nameOf(schema);
    if (fnName !== undefined && fnName in VALUE_PREDICATE_MAP) {
      return VALUE_PREDICATE_MAP[fnName] as JsonSchema;
    }
    return {};
  }

  if (Array.isArray(schema)) {
    return compileTupleSchema(schema, ctx, false);
  }

  if (isPlainObject(schema)) {
    return compileRecordSchema(schema, ctx, false);
  }

  return { const: toJsonLiteral(schema) };
};

/**
 * Compiles any Lion schema value (predicate, record/list shape, `schema/*`
 * combinator, or named schema) to a standard JSON Schema object.
 */
export const toJsonSchema = (
  schema: unknown,
  options: ToJsonSchemaOptions = {}
): JsonSchema => {
  const ctx: Context = { defs: {}, visiting: new Set() };
  const root = compileSchema(schema, ctx);
  const hasDefs = Object.keys(ctx.defs).length > 0;
  return {
    ...(options.includeDraftHeader ? { $schema: DRAFT_2020_12 } : {}),
    ...(hasDefs ? { $defs: ctx.defs } : {}),
    ...root,
  };
};

export interface DatabaseJsonSchemas {
  readonly $defs: Readonly<Record<string, JsonSchema>>;
  readonly $schema: string;
  /** JSON Schema for asserting a fact tuple of each declared relation. */
  readonly relations: Readonly<Record<string, JsonSchema>>;
}

/**
 * Exports all named schemas and relation fact-tuple schemas from `database` as
 * JSON Schema Draft 2020-12 definitions for LLM structured outputs.
 */
export const databaseToJsonSchema = (
  database: LogicDatabase
): DatabaseJsonSchemas => {
  const ctx: Context = { defs: {}, visiting: new Set() };
  for (const schema of database.schemas.values()) {
    compileSchema(schema, ctx);
  }
  const relations: Record<string, JsonSchema> = {};
  for (const [name, info] of database.relations) {
    const prefixItems: JsonSchema[] = [
      { const: name },
      ...info.columns.map((column) => ({ description: column })),
    ];
    relations[name] = {
      description: `Fact tuple for relation "${name}" (${info.columns.join(", ")})`,
      items: false,
      maxItems: info.columns.length + 1,
      minItems: info.columns.length + 1,
      prefixItems,
      type: "array",
    };
  }
  return {
    $defs: ctx.defs,
    $schema: DRAFT_2020_12,
    relations,
  };
};
