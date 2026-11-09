import { execFileSync } from "node:child_process";
import {
  mkdir,
  cp,
  rm,
  readlink,
  symlink,
  lstat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const staging = join(root, "dist", "launcher");
const title = "Home Monitor Latest.app";
const bundle = join(staging, title);
const target = join(homedir(), "Applications", title);
const desktop = join(homedir(), "Desktop", title);
const id = "com.marcosmro.home-monitor.latest-launcher";
const appleString = (value) =>
  '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
await mkdir(staging, { recursive: true });
await rm(bundle, { recursive: true, force: true });
const source = join(staging, "launcher.applescript");
await writeFile(
  source,
  `on run
  try
    do shell script "/bin/zsh " & quoted form of ${appleString(join(root, "scripts", "launch-latest.zsh"))}
  on error errorMessage
    display dialog errorMessage with title "Home Monitor — build failed" buttons {"OK"} default button "OK" with icon stop
  end try
end run
`,
);
execFileSync("/usr/bin/osacompile", ["-o", bundle, source]);
const plist = join(bundle, "Contents", "Info.plist");
execFileSync("/usr/libexec/PlistBuddy", [
  "-c",
  `Add :CFBundleIdentifier string ${id}`,
  plist,
]);
execFileSync("/usr/libexec/PlistBuddy", [
  "-c",
  "Set :CFBundleName Home Monitor Latest",
  plist,
]);
execFileSync("/usr/libexec/PlistBuddy", ["-c", "Delete :CFBundleIconName", plist]);
await cp(
  join(root, "build", "icon.icns"),
  join(bundle, "Contents", "Resources", "applet.icns"),
);
execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", bundle]);
await mkdir(join(homedir(), "Applications"), { recursive: true });
try {
  await lstat(target);
  const existing = execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", join(target, "Contents", "Info.plist")],
    { encoding: "utf8" },
  ).trim();
  if (existing !== id)
    throw new Error(
      "An unrelated application already uses the launcher destination.",
    );
  await rm(target, { recursive: true });
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await cp(bundle, target, { recursive: true });
try {
  const entry = await lstat(desktop);
  if (!entry.isSymbolicLink() || (await readlink(desktop)) !== target)
    throw new Error(
      "An unrelated Desktop item already uses the launcher name.",
    );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  await symlink(target, desktop);
}
console.log(`Installed: ${target}\nDesktop icon: ${desktop}`);
