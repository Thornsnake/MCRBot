#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Install package dependencies
echo "[SETUP] Installing package dependencies ...";
npm install;

# Copy the _config.ts file and rename it to config.ts if it does not exist
if [ ! -f "config.ts" ] ; then
    echo "[SETUP] Config file not found! Copying ...";
    cp template/_config.ts config.ts;
fi

# Compile source code
echo "[SETUP] Compiling source code ...";
./node_modules/.bin/tsc;

# Check if the bot already has a name
if [ ! -f "bot.name" ]
then
    # Name of the bot
    echo "";
    echo "In case you want to run more than one bot, you need to enter a unique name for each!";
    echo "If you are already running a different bot, make sure you give this one another name!";
    echo "";
    echo -n "How do you want to call this bot: ";
    read -r name;

    # Make sure the name is valid
    while [ ! ${#name} -ge 1 ]
    do
        echo "Name invalid, try again: ";
        read -r name;
    done

    # Safe the name in a file
    echo "[SETUP] Saving name ...";
    echo "$name" > bot.name;
fi

echo "[SETUP] Done!";