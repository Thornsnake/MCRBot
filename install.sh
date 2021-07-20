#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

cd "$basedir"

npm install
./node_modules/.bin/tsc