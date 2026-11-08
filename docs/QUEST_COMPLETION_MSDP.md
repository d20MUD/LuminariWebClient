# Quest completion modal

Krynn displays a dismissible web dialog when a subscribed game server sends
`QUEST_COMPLETE`. It shows the quest name, completion prose, and rewards actually
credited after bonuses. Multiple completions queue until each dialog is closed.
Escape and Close dismiss the dialog. Disconnecting clears the queue.

The read-only MSDP variable carries a JSON string with a unique `id`, numeric
`questId`, `name`, `body`, and `rewards` object. Reward labels map to numbers or
strings (quest points, gold, experience, item, follower, or new race). Each event
is flushed immediately. The browser subscribes alongside Krynn web help events.
Terminal completion output is preserved for all clients.

Both the game server and browser proxy must be rebuilt and restarted to enable
the event end to end. No live services are restarted by this source change.

## Acceptance and deployment

Successful normal, shared, and browser quest joins now emit `QUEST_ACCEPTED`.
Automatically accepted quest-chain stages emit the same event after completion.
The payload contains `id`, `questId`, `name`, `body` (acceptance instructions),
`time` (turns, or -1 for unlimited), and `commands` (dialogue commands).
Acceptance and completion events share one browser queue so both remain visible
when a quest completes and immediately starts the next stage.

The running development (4301) and live (4300) game executables inspected during
this fix lacked the new event names. Browser changes cannot display these
notifications until the corresponding game process runs the updated binary.
The previous linker failure was caused by stale generated CMake inputs omitting
`spellhelp.c`; regenerating with `cmake -S . -B build-agent-check` restored it.
A complete `circle` build now succeeds at `/home/krynn/code/bin/circle`.

Quest acceptance and completion prose decodes color tokens before whitespace
trimming. A separate streaming ANSI renderer for each result preserves colors
across paragraphs without leaking them into the next notification.

Failed dialogue checks that assign an alternative quest also emit
`QUEST_ACCEPTED` for that new quest. Its response and follow-up instructions use
the Quest acceptance window preference; skill rolls remain in the main output.
Failures that only ask the player to retry do not emit an acceptance event.
