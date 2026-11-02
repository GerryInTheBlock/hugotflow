// Writes the exercise catalogue (ml/catalogue.json) into migration 0010 as SQL, replacing the
// "-- @@EXERCISE_SEED@@" marker or the previously generated block. Run: node ml/make_exercise_seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { exercises } = JSON.parse(readFileSync(join(root, "ml", "catalogue.json"), "utf8"));
const file = join(root, "supabase", "migrations", "0010_recommendations.sql");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (xs, type) => `array[${xs.map(q).join(", ")}]::${type}[]`;
const codes = new Set(exercises.map((e) => e.code));
for (const e of exercises) for (const s of e.substitutes) if (!codes.has(s)) throw new Error(`${e.code}: unknown substitute ${s}`);

const rows = exercises.map(
  (e) =>
    `  (${q(e.code)}, ${q(e.name)}, ${q(e.equipment)}, ${q(e.body_area)}, ${q(e.pattern)}, ${arr(e.goals, "public.fitness_goal")}, ` +
    `${q(e.impact)}, ${arr(e.contraindicated, "text")}, ${q(e.cue)}, ${arr(e.substitutes, "text")})`,
);
const block = `-- BEGIN generated exercise seed (${exercises.length} exercises)
insert into public.exercises (code, name, equipment_id, body_area, pattern, goals, impact, contraindicated, cue, substitutes)
select v.code, v.name, e.equipment_id, v.body_area, v.pattern, v.goals, v.impact, v.contraindicated, v.cue, v.substitutes
from (values
${rows.join(",\n")}
) as v(code, name, equipment, body_area, pattern, goals, impact, contraindicated, cue, substitutes)
join public.equipment e on e.name = v.equipment
on conflict (code) do update set
  name = excluded.name, equipment_id = excluded.equipment_id, body_area = excluded.body_area, pattern = excluded.pattern,
  goals = excluded.goals, impact = excluded.impact, contraindicated = excluded.contraindicated, cue = excluded.cue,
  substitutes = excluded.substitutes;
-- END generated exercise seed`;

let sql = readFileSync(file, "utf8");
if (sql.includes("-- @@EXERCISE_SEED@@")) sql = sql.replace("-- @@EXERCISE_SEED@@", block);
else sql = sql.replace(/-- BEGIN generated exercise seed[\s\S]*?-- END generated exercise seed/, block);
writeFileSync(file, sql);
console.log(`Seeded ${exercises.length} exercises into ${file}`);
