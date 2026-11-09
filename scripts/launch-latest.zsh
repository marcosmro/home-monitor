#!/bin/zsh
# Finder does not inherit the terminal's PATH.
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
project_dir="${0:A:h:h}"
log_dir="$HOME/Library/Logs/Home Monitor"
mkdir -p "$log_dir"
log_file="$log_dir/latest-build.log"
cd "$project_dir"
if ! npm run pack:mac > "$log_file" 2>&1; then
  print -u2 "Home Monitor could not build the latest code. Details: $log_file"
  exit 1
fi
app_path="$project_dir/dist/mac-arm64/Home Monitor.app"
if [[ ! -d "$app_path" ]]; then
  print -u2 "The build did not produce the expected Apple Silicon application. Details: $log_file"
  exit 1
fi
# Always launch the newly built bundle, even if an older instance was open.
/usr/bin/osascript -e 'if application id "com.marcosmro.home-monitor" is running then tell application id "com.marcosmro.home-monitor" to quit'
/usr/bin/open "$app_path"
