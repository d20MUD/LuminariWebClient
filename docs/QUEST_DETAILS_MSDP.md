# Quest detail modals over MSDP

The Quests tab supports clickable quest names and a native modal dialog. This is
currently enabled **only for Krynn**. Other presets retain their existing quest
list. The modal uses data from the existing `QUEST_INFO` report; clicking does
not send terminal commands, scrape game output, or start another request.

## Enable for another MUD

In `shared/app-settings.ts`, set the desired preset's feature flag:

```ts
features: { questDetails: true },
```

Before enabling Faerun, deploy server support for the fields below and check its
`questInfo` MSDP variable mapping. The default mapping is `QUEST_INFO`. The UI,
parser, and modal are shared; no Faerun-specific modal is needed. Presets without
the flag, including custom connections, keep non-clickable quest lists.

## Payload contract

`QUEST_INFO` remains a JSON string containing an array of the player's active
quests. Existing fields retain their meaning. Additive fields are `description`,
`info`, and `dialogue_commands`.

```json
[
  {
    "slot": 0,
    "vnum": 70001,
    "name": "Defend Palanthas",
    "type": "Kill Mob",
    "description": "Help the militia hold the gates.",
    "info": "The city needs your help.\n\nDefeat the invaders at the gate.",
    "progress": { "remaining": 3, "required": 5, "completed": 2 },
    "time_remaining": 7,
    "targets": [{ "id": 70010, "name": "an invading knight" }],
    "dialogue_commands": []
  }
]
```

- `info` is the accepted quest's journal/instructions (`QST_INFO`), not its
  completion message or builder-only information.
- `description` is the short quest description (`QST_DESC`).
- `time_remaining` uses game turns. A value of zero or less is not displayed.
- `dialogue_commands` lists applicable commands (`convince`, `threaten`, `beguile`)
  for dialogue quests; other quests send an empty array.
- An empty quest list is `[]`, clearing old entries and an open detail modal.
- Missing new fields remain compatible: the modal displays the available data
  and explains when the server supplied no additional journal text.

The modal resolves its selected quest from each new payload using vnum and slot,
so progress updates remain current. Removing the selected quest closes its
modal. Switching MUD presets resets the selection. Close, Escape, or clicking
outside the dialog dismisses it. Native dialog behavior traps focus and restores
it to the quest button. Command-input focus and game key bindings respect the
open dialog.

The client escapes supplied HTML before converting game color/ANSI codes into
styled spans. Journal line breaks and paragraph spacing are retained. The server
sends structured data rather than executable HTML; no raw HTML is trusted.

## Server implementation and buffer limits

The Krynn server implementation is in `~/code/src/comm.c` and `protocol.c`.

Quest serialization uses json-c, avoiding partial hand-built JSON when strings
contain quotes, newlines, color codes, or long text. Only active quests are sent.
The normal MSDP change tracking continues to send updated reports only when
values change.

The MSDP/GMCP variable framing limit is now 1 MiB, including framing overhead.
The shared descriptor output buffer limit is approximately 2 MiB. Large buffers
are allocated on demand using the existing buffer pool, which retains at most
five idle buffers. This raises memory use during larger output bursts.

Telnet subnegotiation packets are queued verbatim as complete packets, bypassing
the smaller ordinary text formatting buffer and terminal color processing.
Packets that cannot fit are rejected whole. Reported MSDP values remain dirty
until successfully queued, allowing retry after pending output drains. The
socket output path preserves unsent bytes after partial writes.

The web proxy already accepts fragmented MSDP subnegotiations and variable-sized
payloads; no larger proxy buffer is needed for this feature. Future panels can
reuse that transport and the safe server packet queue. Keep player data
structured and add optional fields or separate variables as appropriate.

## Copyover recovery

Krynn resets its MSDP REPORT subscriptions during a MUD copyover while retaining
the TCP connection. The proxy reinitializes its configuration whenever Krynn
renegotiates MSDP, including subsequent negotiations on an existing connection.
This resends REPORT and SEND for QUEST_INFO and the other configured variables;
otherwise a surviving web session can retain an empty or stale quest list.

## Validation and rollout

From the web client directory:

```sh
npm run build
npm run lint
node --test tests/*.test.mjs
```

From the MUD code directory:

```sh
python3 tests/run_msdp_quests.py
cmake --build build-agent-check-on -j4
```

Deploy/restart the rebuilt Krynn server and publish the rebuilt web client to
use the complete feature. Source changes and builds alone do not update a
running game process or web service.

In a connected Krynn session, open Quests and select a quest name. Check journal
text, progress, targets, timed and dialogue quests; then complete or abandon the
selected quest. Also check Escape/Close, keyboard navigation, a narrow viewport,
and that Faerun still displays its original quest list.
