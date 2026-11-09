// Copies only the prepared local plans/catalog. Never imports the appraisal or photos.
import {
  readFile,
  mkdir,
  copyFile,
  writeFile,
  chmod,
  rename,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
const source = resolve(process.argv[2] || "private-house/map-project.json");
const project = JSON.parse(await readFile(source, "utf8"));
const dest = process.env.HOME_MONITOR_TEST_DATA
  ? join(process.env.HOME_MONITOR_TEST_DATA, "house-map")
  : join(
      homedir(),
      "Library",
      "Application Support",
      "Home Monitor",
      "house-map",
    );
await mkdir(dest, { recursive: true, mode: 0o700 });
for (const plan of project.plans) {
  if (!/^[a-z0-9-]+$/.test(plan.id)) throw new Error("Invalid plan ID");
  await copyFile(
    join(dirname(source), "plans", `${plan.id}.jpg`),
    join(dest, `${plan.id}.jpg`),
  );
  await chmod(join(dest, `${plan.id}.jpg`), 0o600);
}
await writeFile(join(dest, "project.json.tmp"), JSON.stringify(project), {
  mode: 0o600,
});
await rename(join(dest, "project.json.tmp"), join(dest, "project.json"));
console.log(
  `Imported ${project.plans.length} plans and ${project.rooms.length} room-placement guides. Existing sensor edits preserved.`,
);
