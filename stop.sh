#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Check if the bot is in the process list
if pm2 list | grep MCRBot >/dev/null 2>&1 ; then
    # Stop the bot
    pm2 stop MCRBot;

    echo >&2 "[OK] MCRBot stopped!";
fi