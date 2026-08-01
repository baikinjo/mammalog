import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("daily routine migration is shared safely and included in progress reset", () => {
  const routineSql = readFileSync(new URL("../supabase/routine_logs.sql", import.meta.url), "utf8");
  const controlsSql = readFileSync(new URL("../supabase/data_controls.sql", import.meta.url), "utf8");
  assert.match(routineSql, /create table if not exists public\.daily_routine_logs/);
  assert.match(routineSql, /enable row level security/);
  assert.match(routineSql, /can_access_child\(child_id\)/);
  assert.match(controlsSql, /delete from public\.daily_routine_logs where child_id = target_child_id/);
});
