# MCRBot

**This bot has both a DCA feature (Dollar Cost Averaging) and will also keep your portfolio balanced automatically. The coins in your portfolio can be either chosen manually, or automatically by market cap ranking. It is also supporting Webhooks for Discord.**

> [!NOTE]
> **3.0 — live web dashboard + full browser configuration.**
>
> MCRBot now ships with a built-in **web dashboard** to monitor the portfolio live (a coin-distribution heatmap, target-vs-actual allocation, trades, and a performance chart) and to configure **every** setting from the browser — changes apply **without restarting the bot**. All data (configuration, state and history) now lives in a single SQLite database.
>
> **Clean break:** 3.0 replaces the old `config.ts` file. There is **no automatic migration** — after updating, open the dashboard and re-enter your settings (it only takes a minute). See [What's new in 3.0](#whats-new-in-30) and [Web Dashboard](#web-dashboard) below. (Version 2.0 migrated the bot to the current Crypto.com Exchange **v1 API** — see [What's new in 2.0](#whats-new-in-20).)

## What's new in 3.0
- **Built-in web dashboard** (`Express` + `Socket.IO` backend, `React` + `Vite` + `Tailwind` frontend) that runs in the same process as the bot and updates live over WebSockets.
- **Coin-distribution heatmap** (treemap, sized by holding value and coloured by how far each coin is over/under its target) and **target-vs-actual allocation bars** — the centerpiece of the dashboard.
- **Full configuration from the browser.** Every setting is editable in the dashboard and applied live — including the API keys, the quote currency and the cron schedules — with no restart.
- **First-login password.** The dashboard ships open on `localhost` for setup; on first login you set a password, after which it is locked. The password is stored salted-hashed.
- **Everything in one SQLite database** (`data/database.sqlite3`): configuration, trailing-stop state, the removal list, the full trade history, portfolio/distribution snapshots and events.
- **`nvm`-based setup.** `install.sh` now installs and pins Node via [nvm](https://github.com/nvm-sh/nvm) (see `.nvmrc`) instead of a system-wide install.

## What's new in 2.0
- **Migrated to the Crypto.com Exchange v1 API** (`https://api.crypto.com/exchange/v1/`). The old v2 endpoints were shut down by Crypto.com and no longer work.
- **Fixed [#12](https://github.com/Thornsnake/MCRBot/issues/12)** — the bot could occasionally stop and not restart. Stray errors are now caught globally and webhook failures can no longer take the process down.
- **Fixed [#13](https://github.com/Thornsnake/MCRBot/issues/13)** — with `TOP` set to `0`, the bot could still buy coins that were not in your manual list. Coins scheduled for removal are now sell-only and never bought.
- **Fixed [#21](https://github.com/Thornsnake/MCRBot/issues/21)** — `WEIGHT` is now respected when reinvesting after a coin falls out of the top market caps (previously it was split equally).
- **Fixed [#23](https://github.com/Thornsnake/MCRBot/issues/23)** — the bot no longer reinvests proceeds into a coin it is trying to remove from the portfolio.
- **Fixed [#24](https://github.com/Thornsnake/MCRBot/issues/24)** — rebalancing now redeploys the full sold amount, and the trailing-stop cost basis is no longer inflated by quote currency generated through rebalancing churn.
- **`QUOTE` now supports any quote currency the exchange lists pairs for** (e.g. `USD`, `USDT`, `BTC`, `EUR`), instead of a fixed list. `USD` remains the recommended default — it has by far the widest selection of pairs on the exchange.
- **Optional CoinGecko Demo API key** for more reliable market-cap lookups (`COINGECKO_API_KEY`).
- **Modernized dependencies** (axios 1.x, cron 3.x, TypeScript 5.x) and a small unit-test suite (`npm test`).

## Requirements
The bot runs on NodeJS and is meant to be kept alive by the PM2 process manager. The `install.sh`
script handles almost everything for you — it installs **nvm**, the Node version pinned in `.nvmrc`,
all dependencies, builds both the bot and the dashboard, and installs PM2. You only need **git** and
**curl** available beforehand.
##### Install Git and curl
On Debian/Ubuntu: `apt-get install git curl`.
##### Logrotate (optional)
PM2's log file grows over time. To rotate it daily and keep 30 days, run `pm2 install pm2-logrotate`
after the first start.

## Setup
We now need to download and compile the source code and install the package requirements. The following steps will lead you through that process.
##### Clone MCRBot
Navigate to the folder you want MCRBot to be located in. Then run `git clone https://github.com/Thornsnake/MCRBot.git` to clone the repository.
##### Install and build
Navigate into the bot folder and run `sh install.sh`. It installs Node (via nvm), all dependencies,
compiles the bot, and builds the dashboard. You will be asked to give this bot a unique name, so the
process manager can tell them apart in case you want to run more than one. You do **not** enter any
API keys or settings here — that all happens in the dashboard after the first start.

## Configuration
All configuration is done in the **web dashboard's Settings page** (there is no `config.ts` file
anymore). Start the bot (`sh start.sh`), open the dashboard URL it prints, set a password on first
login, then fill in your Crypto.com API key/secret and the options below. Saving applies changes live —
the bot picks them up without a restart. The available options are:

| Option                     | Type     | Description
| -------------------------- | -------- | ---
| APIKEY                     | string   | The API key from the crypto.com exchange.
| SECRET                     | string   | The secret key from the crypto.com exchange.
| COINGECKO_API_KEY          | string   | Optional. A free CoinGecko Demo API key for more reliable market-cap lookups. Leave empty to use the keyless public API.
| SCHEDULE > TRAILING_STOP   | string   | The interval for the trailing stop check in cron format. Defaults to `every minute at the 30 second mark`.
| SCHEDULE > INVESTING       | string   | The interval for the DCA investing in cron format. Defaults to `every day, 3 minutes after midnight`.
| SCHEDULE > REBALANCE       | string   | The interval for the portfolio rebalancing in cron format. Defaults to `every 5 minutes`.
| QUOTE                      | string   | The quote currency used on the exchange. Any quote currency the exchange lists spot pairs for is supported (e.g. `USD`, `USDT`, `BTC`, `EUR`). `USD` is recommended — it has by far the widest selection of pairs. On the Crypto.com Exchange, `USD` is its own settlement currency; `USDT`/`USDC`/`PYUSD` are separate tradable coins, so they are excluded from trading as stablecoins regardless of the quote you pick.
| INVESTMENT                 | number   | The amount of quote currency invested during each investment interval. This will be split over all coins.
| TOP                        | number   | The top X coins by market cap to invest into and rebalance. Set this to `0` if you want to manually manage all coins.
| REMOVAL                    | number   | The number of hours the bot should wait before selling a coin that has fallen out of the top x coins by market cap.
| INCLUDE                    | string[] | A list of coins to always invest in and rebalance, even if they are not within the market cap.
| EXCLUDE                    | string[] | A list of coins to never invest in or rebalance, even if they are within the market cap.
| THRESHOLD                  | number   | The threshold in percent that a coin's value can deviate from the average before being rebalanced.
| WEIGHT                     | object   | The weight in percent a coin should have in the portfolio. The remaining weight will be split over all other coins.
| TRAILING_STOP > ACTIVE     | boolean  | Whether the trailing stop is active or not.
| TRAILING_STOP > MIN_PROFIT | number   | The minimum amount of profit the bot must make before the trailing stop is switched to active. If this is not triggered, the bot will just keep doing DCA.
| TRAILING_STOP > MAX_DROP   | number   | The maximum amount of value the portfolio is allowed to lose from its all time high before the trailing stop triggers and your portfolio is sold.
| TRAILING_STOP > RESUME     | number   | The amount of hours to wait before resuming to DCA and rebalance after the trailing stop has been triggered.
| IDLE_MESSAGE               | string   | A message that will be shown when the bot had nothing to rebalance, as opposed to just logging nothing.
| WEBHOOKS                   | object   | Post messages to social media platforms via webhooks when there is a new investment, rebalance or trailing stop hit.
| AUTO_UPDATE                | boolean  | Automatically check for updates every 24 hours and (if one was found) install them. Will restart the bot automatically after the update.
| DRY                        | boolean  | Dry run. Don't execute the orders on the exchange. This is a debug feature.

Each field in the Settings page has a short description. When you are done, click **Save**.

## Web Dashboard
The dashboard runs in the same process as the bot and starts automatically (unless you set
`GUI > ACTIVE` to false). When the bot starts it prints the URL, e.g. `http://127.0.0.1:4100`.

- **First login:** on first access you are asked to set a password. After that the dashboard is locked
  and you log in with it. The password is stored salted-hashed in the database.
- **Pages:** a **Dashboard** (portfolio worth, trailing-stop status, the distribution heatmap, recent
  trades), a **Distribution** page (the treemap heatmap + target-vs-actual allocation bars), **Trades**
  (filterable history; populated in dry-run too), **Performance** (portfolio value over time), and
  **Settings** (every option above, applied live).
- **Network & security:** by default the dashboard binds to `127.0.0.1` (localhost only). To reach it
  from another machine, either set `GUI > HOST` to `0.0.0.0` (only with a password set!) or, preferably,
  use an SSH tunnel: `ssh -L 4100:127.0.0.1:4100 user@server`, then open `http://127.0.0.1:4100` locally.
- **Dashboard options** (also in Settings): `GUI > ACTIVE`, `HOST`, `PORT` (default 4100),
  `ALLOW_CONFIG` (allow editing settings from the browser) and `POLL_INTERVAL` (seconds between live
  portfolio refreshes, min 20).

## Starting, Restarting and Stopping
You can easily start, restart and stop the bot by executing the corresponding scripts, either with `sh start.sh`, `sh restart.sh` or `sh stop.sh`.

## Monitoring and Logs
To monitor your currently running bot, enter `pm2 monit` and select it with the arrow keys in the list on the left.
If you would like to check the log files, you can usually find them under `/root/.pm2/logs/` or you can check the latest log lines with `pm2 logs MCRBot`. For more PM2 commands, visit the [Quick Start Page](https://pm2.keymetrics.io/docs/usage/quick-start/).

## Updating the Bot
To update the bot to the newest version, execute `sh update.sh`. This will also automatically restart your bot after the update. Your current configuration will remain the same.

You can also activate the `AUTO_UPDATE` option in the config file for automatic updates from Github every 24 hours.

**Upgrading to 3.0 is a clean break.** Configuration moved out of `config.ts` into the SQLite database
and is now managed entirely from the dashboard. After running `sh update.sh`, open the dashboard, set a
password, and re-enter your settings (API keys, quote currency, schedules, weights, etc.). Your old
`config.ts` and the `data/*.json` state files are no longer used; the new single database is
`data/database.sqlite3`.

## Running the tests
A small unit-test suite covers the portfolio math. Run it with `npm test`. You can also verify that the live Crypto.com public API still matches what the bot expects with `npm run smoke` (read-only, no API key required).