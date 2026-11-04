# ActivityWatcher Sender

A Zotero 7–10 plugin that tells your local [ActivityWatch](https://activitywatch.net) server what you are doing in Zotero, so your time in Zotero can be reported **by collection** — e.g. `My Library/Classes/2026-B/RD - POGO 801`.

ActivityWatch's window watcher only sees Zotero's window title, which shows a collection's leaf name in the library view and only the PDF file name (or "title - authors - year") in a reader tab — never the collection. This plugin fills that gap. It was built to feed the class-tracking dashboards in [activity-watch](https://github.com/jsglazer/activity-watch).

Version: 1.0.0

## What it sends

Every 15 seconds, and immediately when you switch tabs or collections, the plugin sends a heartbeat to `http://127.0.0.1:5600` in the bucket `aw-watcher-zotero_<hostname>` (type `app.zotero.activity`; the hostname is the one aw-server reports, so the bucket lines up with aw-watcher-window/afk and is synced by aw-sync like the other watchers).

| Field                           | Library view                                                                                                      | Reader tab                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `view`                          | `library`                                                                                                         | `reader` (`other` for any other tab type, e.g. a note tab) |
| `library`                       | `My Library` or the group name                                                                                    | same                                                       |
| `collection`                    | full path of the selected collection, e.g. `My Library/Classes/2026-B/RD - POGO 801`                              | the open item's **deepest** collection                     |
| `collection_key`                | that collection's key                                                                                             | same                                                       |
| `row`                           | `collection`, `library`, `unfiled`, `duplicates`, `trash`, `search:<name>`, `publications`, `feed`, or `multiple` | `collection`, or `unfiled` if the item is in no collection |
| `item_key`, `attachment_key`    | empty                                                                                                             | parent item and attachment keys                            |
| `item_title`, `attachment_name` | empty                                                                                                             | title and file name (empty if _Include titles_ is off)     |
| `ambiguous`                     | 0                                                                                                                 | number of collections tied for deepest, else 0             |

Rules:

- **Deepest collection.** An item in several collections is credited to the deepest one only; dashboards roll time up into parent collections. On a tie, a collection at or below the one selected in the library pane wins, then the alphabetically first path — so attribution never flips between heartbeats.
- **Paths.** Levels are joined with `/`; a `/` inside a collection name is sent as `∕` (U+2215).
- **Several selected collections** (Zotero 10): `collection` is their deepest common ancestor and `row` is `multiple`.
- **No attention tracking.** The plugin reports Zotero's context continuously; whether you were actually there (Zotero frontmost, not AFK) is worked out on the dashboard from aw-watcher-window and aw-watcher-afk.
- **Stable data.** The data object has a fixed key set and order and no timestamps or counters, so consecutive heartbeats merge into one ActivityWatch event while the context is unchanged.
- **Local only.** Only `127.0.0.1`, `localhost` and `[::1]` are accepted as the server address; anything else turns sending off. Nothing is queued: if ActivityWatch is not running, heartbeats are dropped and the plugin retries quietly (15 s, 30 s, 60 s … up to 5 min), logging once per outage to Zotero's debug output.

## Install

1. Download `activity-watcher-sender.xpi` from the [latest release](https://github.com/jsglazer/activitywatcher-sender/releases) (or build it, below).
2. Zotero → Tools → Plugins → gear menu → _Install Plugin From File…_ → choose the xpi.
3. Do this on every Mac you use Zotero on. With aw-sync running, each Mac's bucket reaches the Mac that runs the dashboards.

## Settings

Zotero → Settings → ActivityWatcher Sender:

| Setting                                       | Default                 | Pref                                                |
| --------------------------------------------- | ----------------------- | --------------------------------------------------- |
| Send Zotero activity to ActivityWatch         | on                      | `extensions.activitywatcher-sender.enabled`         |
| ActivityWatch server (loopback only)          | `http://127.0.0.1:5600` | `extensions.activitywatcher-sender.serverURL`       |
| Heartbeat every (seconds, 5–120)              | 15                      | `extensions.activitywatcher-sender.intervalSeconds` |
| Include item titles and attachment file names | on                      | `extensions.activitywatcher-sender.sendTitles`      |

The pane also shows a live status line ("Last heartbeat 4 s ago to bucket aw-watcher-zotero_MBA24.local", or why it is not sending). From Tools → Developer → Run JavaScript, `Zotero.ActivityWatcherSender.getStatus()` returns the same state.

Titles end up in the local ActivityWatch database, which aw-sync copies to your other computers; turn _Include titles_ off if you don't want that.

## Checking it works

```bash
curl -s "http://127.0.0.1:5600/api/0/buckets/aw-watcher-zotero_$(curl -s http://127.0.0.1:5600/api/0/info | python3 -c 'import json,sys;print(json.load(sys.stdin)["hostname"])')/events?limit=5" | python3 -m json.tool
```

## Develop

```bash
npm install
npm test            # Vitest: the pure core, headless
npm run typecheck
npm run lint
npm run build       # → build/activity-watcher-sender.xpi
```

Layout (pure-core rule — nothing in `src/core` touches a Zotero global):

| Path                          | Role                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/core/path.ts`            | collection chain → path, `/` escaping, common ancestor                                                                     |
| `src/core/deepest.ts`         | deepest-collection choice with the deterministic tie-break                                                                 |
| `src/core/context.ts`         | snapshot → heartbeat data (fixed key order)                                                                                |
| `src/core/url.ts`             | loopback validation, bucket id, REST URLs, interval clamp                                                                  |
| `src/core/awClient.ts`        | aw-server calls through an injected `fetch`; never throws                                                                  |
| `src/core/sender.ts`          | tick loop: interval, coalesced triggers, no overlap, backoff, stop                                                         |
| `src/adapters/zoteroState.ts` | the only module that reads Zotero UI state (tabs, reader item, collection-tree selection)                                  |
| `src/adapters/http.ts`        | sandbox `fetch` with a timeout (not `Zotero.HTTP.request`, which refuses loopback calls while Zotero thinks it is offline) |
| `src/adapters/prefs.ts`       | typed prefs                                                                                                                |
| `src/hooks.ts`                | startup/shutdown wiring; every registration has a matching removal                                                         |
| `test/`                       | Vitest suites for every `src/core` module, with an in-memory fake aw-server                                                |

## License

MIT
