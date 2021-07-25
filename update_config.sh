#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

cd "$basedir"

./node_modules/.bin/tsc