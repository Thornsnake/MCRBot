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
    # Pull the current repository
    git pull origin master;

    # Execute the install script
    sh install.sh;

    # Execute the restart script
    sh restart.sh;
else
    echo "[SKIP] Your version is up to date!";
fi