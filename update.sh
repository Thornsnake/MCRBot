#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Reset the git cache
git reset --hard

# Pull the current repository
git pull origin master

# Execute the install script
sh install.sh

# Execute the restart script
sh restart.sh