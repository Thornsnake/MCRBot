#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Reset the git cache
git reset --hard

# Fetch new code
git fetch

# Get the Head and Upstream hashes
HEADHASH=$(git rev-parse HEAD)
UPSTREAM=$(git rev-parse master@{upstream})

# Check if there are any updates to the current code
if [ "$HEADHASH" != "$UPSTREAM" ]
then
    # Pull, rebuild and restart — but only proceed to each step if the previous one succeeded, so a
    # failed pull or a broken compile never restarts the bot on a half-updated / non-compiling tree.
    if git pull origin master && sh install.sh && sh restart.sh; then
        echo "[OK] Update complete.";
    else
        echo "[ERROR] Update failed; the bot keeps running the previous version.";
        exit 1;
    fi
else
    echo "[SKIP] Your version is up to date!";
fi