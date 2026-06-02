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

# Check if the bot is already registered with pm2 (exact name match, not a fuzzy table grep that
# could collide with a similarly-named process).
if pm2 describe "$name" >/dev/null 2>&1
then
    sh restart.sh
else
    # Compile the typescript files to javascript
    if ! ./node_modules/.bin/tsc; then
        echo "[ERROR] Compilation failed; not starting the bot.";
        exit 1;
    fi

    # Start the bot
    pm2 start index.js --name "$name" --time;

    echo "[OK] $name started!";
fi