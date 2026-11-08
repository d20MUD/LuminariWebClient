# Room quest notification

Krynn shows a “Quests available here” banner above the terminal when the current
room contains a visible quest giver offering a quest the player can join. View
quests opens a native dialog with each quest’s giver, description,
level range, time limit, and Join quest button. Escape or Close dismisses it.
Joining closes the dialog; the normal game output confirms acceptance or explains
why it failed. Availability refreshes with the regular MSDP updates, including
after joining or completing quests. Moving or disconnecting hides stale offers.

The proxy opts into read-only `ROOM_QUESTS` alongside Krynn web modal reports.
It is a JSON string: `{ "room": 1005, "quests": [{ "id": 100, "name": "Quest",
"description": "Summary", "info": "Journal", "giver": "Guard", "minLevel": 5,
"maxLevel": 20, "time": 30 }] }`. Empty arrays clear the notification. The server
uses the normal joining requirements without staff overrides, including slots,
prior quests, dialogue outcomes, level limits, and required objects. Visibility
checks prevent exposing hidden quest givers. Failure messages are captured during
availability checks and never sent to the player.

Join sends `quest webjoin <room-vnum> <quest-vnum>`. The server independently
checks the current room, visible giver, and all joining requirements before
starting the quest. Explicit IDs support several quest givers in one room.
The server flushes refreshed availability after every join attempt.

Both game server and browser proxy require rebuilding and restarting. No live
services are restarted as part of this source change.

Acceptance instructions are shown only after a successful join, in the quest
acceptance modal (or main output if that window is disabled). Available quest
cards and their main-output fallback omit the acceptance text.
