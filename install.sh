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
./node_modules/.bin/tsc;

# Build the web dashboard. This is optional — if it fails, the bot still runs,
# just without the dashboard.
if [ -d "gui" ]; then
    echo "[SETUP] Building the web dashboard ...";
    ( cd gui && npm install && npm run build ) || echo "[WARN] Dashboard build failed; the bot will run without the dashboard.";
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
    echo -n "How do you want to call this bot: ";
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
