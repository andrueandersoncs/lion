import { Context } from "effect";
import type { LogicDatabase } from "@/logic/database";

/** Holds the relations, facts, and rules for one Lion evaluation. */
export class LionDatabaseService extends Context.Service<
  LionDatabaseService,
  LogicDatabase
>()("LionDatabaseService") {}
