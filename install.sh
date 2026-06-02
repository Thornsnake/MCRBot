#!/bin/sh

# Get the base directory and switch into it
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')");
cd "$basedir";

# ---------------------------------------------------------------------------
# Node via nvm (Node Version Manager) — no system-wide install, no root needed
# ---------------------------------------------------------------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}";

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "[SETUP] Installing nvm (Node Version Manager) ...";
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash;
fi

# Load nvm into this shell.
# shellcheck disable=SC1090
\. "$NVM_DIR/nvm.sh";

echo "[SETUP] Installing and using the Node version from .nvmrc ...";
nvm install;
nvm use;

# ---------------------------------------------------------------------------
# Dependencies + build
# ---------------------------------------------------------------------------
echo "[SETUP] Installing package dependencies ...";
npm install;

echo "[SETUP] Compiling the bot ...";
if ! ./node_modules/.bin/tsc; then
    echo "[ERROR] Bot compilation failed; aborting so the previous build is left intact.";
    exit 1;
fi

# Build the web dashboard. This is optional — if it fails, the bot still runs,
# just without the dashboard. Build into a temporary directory and swap it into place only on
# success, so a failed build never wipes the existing dashboard (vite empties its output dir at the
# start of every build).
if [ -d "gui" ]; then
    echo "[SETUP] Building the web dashboard ...";
    if ( cd gui && npm install && npm run build -- --outDir ../class/gui/public.next --emptyOutDir ); then
        rm -rf class/gui/public;
        mv class/gui/public.next class/gui/public;
        echo "[SETUP] Dashboard built.";
    else
        rm -rf class/gui/public.next 2>/dev/null;
        echo "[WARN] Dashboard build failed; keeping the previous dashboard build.";
    fi
fi

# Install PM2 globally (under the active nvm Node) if it is not present.
if ! command -v pm2 >/dev/null 2>&1; then
    echo "[SETUP] Installing PM2 ...";
    npm install -g pm2;
fi

# ---------------------------------------------------------------------------
# Bot name (used by PM2 to tell multiple bots apart)
# ---------------------------------------------------------------------------
if [ ! -f "bot.name" ]
then
    echo "";
    echo "In case you want to run more than one bot, you need to enter a unique name for each!";
    echo "If you are already running a different bot, make sure you give this one another name!";
    echo "";
    printf "How do you want to call this bot: ";
    read -r name;

    while [ ! ${#name} -ge 1 ]
    do
        echo "Name invalid, try again: ";
        read -r name;
    done

    echo "[SETUP] Saving name ...";
    echo "$name" > bot.name;
fi

echo "[SETUP] Done!";
echo "[SETUP] All configuration (including your API keys) is now done in the web dashboard.";
echo "[SETUP] Start the bot with 'sh start.sh', then open the dashboard URL it prints.";
