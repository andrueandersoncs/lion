/**
 * Listing: the values a schema allows, when it allows finitely many.
 *
 * A schema stands for every value that fits it. When those are finitely
 * many, and the schema says which, it can list them, and `schema/fits?` can
 * then bind the value it checks to each in turn, as `in` binds its element
 * to each item of a list. Data lists itself. A record or list of schemas
 * lists every way of choosing a value for each part, a key whose schema is
 * optional with and without it. `schema/anyOf` lists what any of its schemas
 * lists, and `schema/allOf` what its first schema that can list lists. A
 * predicate lists the values it says it accepts, as `value/boolean?` does,
 * and a list of at most so many items lists every list of that length or
 * shorter.
 *
 * What a listing gives may hold values that do not fit, where `schema/allOf`
 * or a predicate in it narrows a choice: whoever binds a value checks each
 * one against the schema, by the rule every check follows. So the values a
 * schema stands for are exactly those that fit it.
 */
import { LogicError } from "@/errors/evaluation";
import {
  isPredicate,
  listWithoutMost,
  namesItself,
  notAShape,
  openWithoutRest,
} from "@/logic/reasons";
import {
  allowedBy,
  buildOf,
  isPlainObject,
  LogicValue,
  nameOf,
  relationOf,
  type SchemaInfo,
  schemaOf,
  show,
  Unknown,
  valueKey,
} from "@/logic/terms";

/** The most values one listing gives, so that it ends soon. */
export const MOST_LISTED = 100_000;

/** Why a schema cannot list the values it allows. */
class Unlisted {
  readonly why: string;
  constructor(why: string) {
    this.why = why;
  }
}

/** The values a schema allows, worked out when they are needed. */
type Listing = Unlisted | (() => readonly unknown[]);

/**
 * The named schemas being listed: those met at the value being listed now,
 * which give nothing more when met there again, and every one met on the
 * way to it, which allows values of any size when met again inside them.
 */
interface Path {
  readonly around: ReadonlySet<SchemaInfo>;
  readonly here: ReadonlySet<SchemaInfo>;
}

const START: Path = { around: new Set(), here: new Set() };

/** One step into the value: no named schema is met there yet. */
const inward = ({ around }: Path): Path => ({ around, here: new Set() });

const tooMany = () =>
  new LogicError({
    message: `A schema that stands for each value it allows may allow at most ${MOST_LISTED.toLocaleString("en")} values, so that listing them ends soon. Narrow it, or bind the value with a relation goal first.`,
  });

/** What a schema is through its names: the shape the last name gives. */
const throughNames = (schema: unknown): unknown => {
  const seen = new Set<unknown>();
  let shape = schema;
  for (
    let named = schemaOf(shape);
    named?.shape !== undefined && !seen.has(shape);
    named = schemaOf(shape)
  ) {
    seen.add(shape);
    shape = named.shape;
  }
  return shape;
};

/** What a schema is built from, when the function `name` builds it. */
const builtAs = (schema: unknown, name: string) => {
  const built = buildOf(throughNames(schema));
  return built !== undefined && nameOf(built.by) === name
    ? built.args
    : undefined;
};

/** Each listing in turn, or the first that cannot list. */
const all = (listings: readonly Listing[]) => {
  for (const listing of listings) {
    if (listing instanceof Unlisted) {
      return listing;
    }
  }
  return listings as readonly (() => readonly unknown[])[];
};

/**
 * Every way of extending what was chosen so far with one of the choices,
 * or of leaving it as it is too, when `optional`.
 */
const extend = <T>(
  sofar: readonly T[],
  choices: readonly unknown[],
  add: (chosen: T, choice: unknown) => T,
  optional = false
): T[] => {
  const out: T[] = [];
  for (const chosen of sofar) {
    if (optional) {
      out.push(chosen);
    }
    for (const choice of choices) {
      out.push(add(chosen, choice));
    }
    if (out.length > MOST_LISTED) {
      throw tooMany();
    }
  }
  return out;
};

/**
 * A record of schemas: every way of choosing a value for each key, one whose
 * schema is optional left out too, with what the schema of its rest lists
 * for the other keys.
 */
const recordListing = (
  fields: readonly (readonly [string, unknown])[],
  rest: Listing | undefined,
  path: Path
): Listing => {
  const parts = all(
    fields.map(([, part]) => {
      const optional = builtAs(part, "schema/optional");
      return listing(optional === undefined ? part : optional[0], inward(path));
    })
  );
  if (parts instanceof Unlisted) {
    return parts;
  }
  if (rest instanceof Unlisted) {
    return rest;
  }
  return () => {
    let records: Record<string, unknown>[] = [{}];
    for (const [at, [key, part]] of fields.entries()) {
      records = extend(
        records,
        (parts[at] as () => readonly unknown[])(),
        (record, value) => ({ ...record, [key]: value }),
        builtAs(part, "schema/optional") !== undefined
      );
    }
    if (rest === undefined) {
      return records;
    }
    // What the rest lists is the record of the other keys. One that holds a
    // key the record names gives a value the check then turns away.
    return extend(
      records,
      rest().filter((value) => isPlainObject(value)),
      (record, other) => ({ ...record, ...(other as Record<string, unknown>) })
    );
  };
};

/**
 * A list of schemas: every way of choosing a value for each item, followed
 * by what the schema of its rest lists for the items after them.
 */
const listListing = (
  items: readonly unknown[],
  rest: Listing | undefined,
  path: Path
): Listing => {
  const parts = all(items.map((item) => listing(item, inward(path))));
  if (parts instanceof Unlisted) {
    return parts;
  }
  if (rest instanceof Unlisted) {
    return rest;
  }
  return () => {
    let lists: unknown[][] = [[]];
    for (const part of parts) {
      lists = extend(lists, part(), (list, value) => [...list, value]);
    }
    if (rest === undefined) {
      return lists;
    }
    return extend(
      lists,
      rest().filter((value) => Array.isArray(value)),
      (list, after) => [...list, ...(after as unknown[])]
    );
  };
};

/** The values what a function of the `schema` module builds allows. */
const builtListing = (
  name: string | undefined,
  args: readonly unknown[],
  schema: unknown,
  path: Path
): Listing | undefined => {
  switch (name) {
    case "schema/anyOf": {
      const parts = all(args.map((part) => listing(part, path)));
      return parts instanceof Unlisted
        ? parts
        : () => parts.flatMap((part) => part());
    }
    case "schema/allOf": {
      const parts = args.map((part) => listing(part, path));
      return (
        parts.find((part) => !(part instanceof Unlisted)) ??
        parts[0] ??
        new Unlisted("schema/allOf of no schemas allows every value")
      );
    }
    case "schema/optional":
      return listing(args[0], path);
    case "schema/arrayOf": {
      const [item, most] = args;
      if (most === undefined) {
        return new Unlisted(listWithoutMost(schema, item));
      }
      if (most === 0) {
        return () => [[]];
      }
      const each = listing(item, inward(path));
      if (each instanceof Unlisted) {
        return each;
      }
      return () => {
        const choices = each();
        let longest: unknown[][] = [[]];
        const lists: unknown[][] = [[]];
        for (let length = 1; length <= (most as number); length += 1) {
          longest = extend(longest, choices, (list, value) => [...list, value]);
          lists.push(...longest);
          if (lists.length > MOST_LISTED) {
            throw tooMany();
          }
        }
        return lists;
      };
    }
    case "schema/recordOf":
      return new Unlisted(`${show(schema)} allows records with any keys`);
    case "schema/open": {
      const [shape, ...rest] = args;
      if (rest.length === 0) {
        return new Unlisted(openWithoutRest(schema));
      }
      const after = listing(rest[0], inward(path));
      const items = throughNames(shape);
      if (Array.isArray(items)) {
        return listListing(items, after, path);
      }
      return isPlainObject(items)
        ? recordListing(Object.entries(items), after, path)
        : new Unlisted(notAShape(shape));
    }
    default:
      return undefined;
  }
};

/** The values a function allows as a schema. */
const functionListing = (schema: unknown, path: Path): Listing => {
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (named.definition === undefined) {
      return new Unlisted(`"${named.name}" is still being declared`);
    }
    if (path.here.has(named)) {
      // Met again at the same value, a schema assumes it does not fit, as a
      // check does: it adds nothing to what the rest of it allows.
      return () => [];
    }
    if (path.around.has(named)) {
      return new Unlisted(namesItself(named.name));
    }
    return listing(named.shape, {
      around: new Set([...path.around, named]),
      here: new Set([...path.here, named]),
    });
  }
  const allowed = allowedBy(schema);
  if (allowed !== undefined) {
    return () => allowed;
  }
  const built = buildOf(schema);
  const listingBuilt =
    built === undefined
      ? undefined
      : builtListing(nameOf(built.by), built.args, schema, path);
  if (listingBuilt !== undefined) {
    return listingBuilt;
  }
  const relation = relationOf(schema);
  if (relation !== undefined) {
    return new Unlisted(
      `"${relation.name}" is a relation; bind the value with the relation goal ["${relation.name}", value] instead`
    );
  }
  return new Unlisted(isPredicate(schema));
};

/** The values a schema allows, or why it cannot list them. */
const listing = (schema: unknown, path: Path = START): Listing => {
  if (schema instanceof LogicValue) {
    return new Unlisted(`${show(schema)} is not known yet`);
  }
  if (typeof schema === "function") {
    return functionListing(schema, path);
  }
  if (Array.isArray(schema)) {
    return listListing(schema, undefined, path);
  }
  if (isPlainObject(schema) && !(schema instanceof Unknown)) {
    return recordListing(Object.entries(schema), undefined, path);
  }
  // Any other value is data, which fits exactly itself.
  return () => [schema];
};

/**
 * Why a schema cannot stand for each value it allows, as a sentence;
 * undefined when it can.
 */
export const unlisted = (schema: unknown): string | undefined => {
  const found = listing(schema);
  return found instanceof Unlisted ? sentence(found) : undefined;
};

const sentence = ({ why }: Unlisted) =>
  `A schema binds the value it checks only when it can stand for each value it allows, and here ${why}.`;

/**
 * The values a schema can stand for, each once: every value that fits it is
 * among them. Fails when the schema cannot list them, or lists too many.
 */
export const candidatesOf = (schema: unknown): readonly unknown[] => {
  const found = listing(schema);
  if (found instanceof Unlisted) {
    throw new LogicError({ message: sentence(found) });
  }
  const values = found();
  if (values.length > MOST_LISTED) {
    throw tooMany();
  }
  return [...new Map(values.map((value) => [valueKey(value), value])).values()];
};
