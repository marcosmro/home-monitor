#!/bin/zsh
# Finder does not inherit the terminal's PATH.
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
project_dir="${0:A:h:h}"
log_dir="$HOME/Library/Logs/Home Monitor"
mkdir -p "$log_dir"
log_file="$log_dir/latest-build.log"
launch_log="$log_dir/latest-launch.log"
# Keep the AppleScript caller's stderr for a useful failure dialog.
exec 3>&2
exec > "$launch_log" 2>&1
TRAPZERR() {
  print -u3 "Home Monitor could not start. Details: $launch_log"
}
print "Starting latest local build: $(date -Iseconds)"
cd "$project_dir"
if ! npm run pack:mac > "$log_file" 2>&1; then
  print -u3 "Home Monitor could not build the latest code. Details: $log_file"
  exit 1
fi
app_path="$project_dir/dist/mac-arm64/Home Monitor.app"
if [[ ! -d "$app_path" ]]; then
  print -u3 "The build did not produce the expected Apple Silicon application. Details: $log_file"
  exit 1
fi
# Always launch the newly built bundle, even if an older instance was open.
# Avoid Apple Events: a Finder-launched applet has separate Automation permissions.
# SIGTERM requests normal process shutdown; never force-kill an active app.
app_pids=$(/usr/bin/pgrep -u "$(id -u)" -x "Home Monitor" || true)
if [[ -n "$app_pids" ]]; then
  for app_pid in ${(f)app_pids}; do
    print "Stopping previous Home Monitor process: $app_pid"
    kill -TERM "$app_pid"
    for attempt in {1..50}; do
      kill -0 "$app_pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$app_pid" 2>/dev/null; then
      print -u3 "Home Monitor is still closing. Please quit it and try again. Details: $launch_log"
      exit 1
    fi
  done
fi
print "Opening: $app_path"
/usr/bin/open -n "$app_path"
for attempt in {1..50}; do
  if /usr/bin/pgrep -u "$(id -u)" -x "Home Monitor" >/dev/null; then
    print "Home Monitor started successfully."
    exit 0
  fi
  sleep 0.1
done
print -u3 "macOS did not start Home Monitor. Details: $launch_log"
exit 1
