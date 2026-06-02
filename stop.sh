#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Load nvm so the correct Node and globally installed tools (pm2) are on the PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}";
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use >/dev/null 2>&1;

# Make sure the name file exists
if [ ! -f "bot.name" ]
then
    echo "[SETUP] Name file not found! Try running install.sh ...";
    exit;
fi

# Get the name of the bot
read -r name < bot.name;

# Check if the bot is registered with pm2 (exact name match).
if pm2 describe "$name" >/dev/null 2>&1
then
    # Stop the bot
    pm2 stop "$name";

    echo "[OK] $name stopped!";
fi