#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# Install package dependencies
echo >&2 "[SETUP] Installing package dependencies ...";
npm install;

# Compile source code
echo >&2 "[SETUP] Compiling source code ...";
./node_modules/.bin/tsc;

# Copy the _config.ts file and rename it to config.ts if it does not exist
if [ ! -f "config.ts" ] ; then
    echo >&2 "[SETUP] Config file not found! Copying ...";
    cp _config.ts config.ts;
fi

echo >&2 "[SETUP] Done!";