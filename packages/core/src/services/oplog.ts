import { Context, type Ref } from "effect";
import type { OplogEntrySchema } from "@/schemas/oplog";

export class LionOplogService extends Context.Tag("LionOplogService")<
  LionOplogService,
  Ref.Ref<(typeof OplogEntrySchema.Type)[]>
>() {}
