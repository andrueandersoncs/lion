import { Context, Ref } from "effect";
import type { OplogEntrySchema } from "@/schemas/oplog";

export class LionOplogService extends Context.Tag("LionOplogService")<
  LionOplogService,
  Ref.Ref<(typeof OplogEntrySchema.Type)[]>
>() {}

export const makeOplogRef = (entries: (typeof OplogEntrySchema.Type)[]) =>
  Ref.make<(typeof OplogEntrySchema.Type)[]>(entries);
