# Krynn web help modals

Typing `help`, `help ranged`, or any other normal help request opens a web modal
on Krynn. Command aliases and abbreviations still resolve through the MUD's
normal command interpreter. The existing help handler chain supplies authored
entries, generated spell/feat/class/race help, and missing-topic suggestions with
the same level checks as terminal help.

The modal reuses the quest dialog's focus handling, Close/Escape/backdrop
behavior, and protection against stale close events in React Strict Mode.
Prose reflows, game colors are retained, tables and indented examples remain
monospaced and horizontally scrollable, and supplied HTML is escaped.

## Enablement

`shared/app-settings.ts` enables `features.helpModal` only on the Krynn preset.
The proxy subscribes to HELP_INFO only for a configured host with this feature.
Faerun and other presets continue to use terminal help. To enable Faerun later,
deploy the server support and set `features: { helpModal: true }` on its preset.

The server requires the descriptor to have MSDP enabled and REPORT HELP_INFO
active before routing help into the modal. Older servers that do not advertise
or recognize this variable continue to display normal terminal help.

## MSDP contract

HELP_INFO is an on-demand read-only JSON string:

```json
{
  "id": "1794100000:123456:1",
  "topic": "ranged",
  "body": "RANGED COMBAT AND AMMUNITION\n\nUse fire <target>...",
  "truncated": false
}
```

The client sends the usual game command; it does not scrape terminal output or
query the help database directly. The server runs the normal help lookup with a
scoped output capture, bypasses pagination, and flushes the JSON result over
MSDP. Database help contributes its authored body without the terminal metadata
frame. Generated help and suggestions use their existing handlers.

Each request receives a distinct ID, even when the same topic is requested
again. The browser remembers the last received ID so background SEND refreshes
and copyover resubscriptions do not reopen an old result. Repeating the command
produces a new ID and reopens the modal. Connection changes clear dialog state.

Captured text is limited to 128 KiB before JSON escaping, keeping even heavily
escaped responses within the existing 1 MiB MSDP limit. The modal indicates any
truncation. Capture is scoped to the single synchronous help command; ordinary
output, other players' descriptors, and classic clients retain their normal
behavior. The existing pager state is not created or consumed by modal help.

## Validation

Web client:

```sh
node --test tests/*.test.mjs
npm run build
npm run lint
```

MUD code:

```sh
python3 tests/run_web_help.py
python3 tests/run_msdp_quests.py
```

Rebuild the MUD with its normal build configuration and perform the usual dev
copyover/restart to activate server support. `npm run dev` reloads the proxy and
browser changes; production requires publishing the rebuilt client and proxy.

Check `help`, a normal entry, a spell or feat, a nonexistent topic, repeated
requests after closing the modal, a long entry, and a classic telnet client.
