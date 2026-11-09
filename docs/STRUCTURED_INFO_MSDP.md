# Structured lore, score and who

Krynn clients subscribe to `LORE_INFO`, `SCORE_INFO` and `WHO_INFO`. Each report
is JSON with `id`, `topic`, `body`, `truncated`, and native `fields` records
(`section`, `label`, `value`). Who also supplies `players` records.

The web client renders fields as grouped facts and players as readable cards.
It does not extract values or names from terminal output. `body` retains the
complete existing command output for the expandable detail view, errors, and
main-output fallback when a window is disabled. Windows includes separate Lore,
Score and Who switches, including All on / All off.

Lore data is collected only after the existing target/skill checks succeed.
Disguised creatures keep the normal early concealment path. Inquisitor-only
active effects stay inside the existing perk check. Who records are collected
inside the native filtered player loop: invisibility, anonymity, introductions,
levels, rooms, classes, groups and other who flags keep their existing rules.
Anonymous records omit real identity, race, level and faction; staff records
also omit numeric level and race. Accounts are never included in player cards.

Clients without the report subscription retain the existing command behavior.
Rebuild the game and web client/proxy, and restart them to enable the reports.
Development uses game port 4301 and web client/proxy ports 3211/3212.

## Preferred ammunition

`ammopref <ammo keywords>` selects ammunition from the equipped ammo pouch.
Numbered keywords work like other object selection commands. `ammopref` shows
the current preference and usage; `ammopref none` or `ammopref auto` clears it.
The preference is saved in the player's `AmPr` field (prototype vnum plus one;
zero means automatic), so replacement bundles of that kind are preferred too.

Each compatibility check scans the pouch for usable ammo matching the wielded
weapon, preferring the saved kind, then falling back to other usable ammo. An
empty/incompatible preferred bundle cannot stop the player using compatible
ammo. Selection moves the chosen bundle to the head by relinking containment
entries, preserving weight and quantity. Fire, reload, autofire and subsequent
combat shots share this selection path.

## Colors in the main output

Captured MSDP bodies retain original tab/caret color markup. When a window is
turned off, or a pending modal is moved back to main output, appendWindowOutput
converts that markup to ANSI before joining the terminal stream. The same path
covers score, who, lore, help, loot, quest detail/list text, and creation text.
Raw ANSI arriving from the game keeps its existing path and is not decoded a
second time. Modal rendering continues to decode its own independent values.

Server audit: ordinary vwrite_to_output still calls ProtocolOutput; capture
intercepts only opted-in structured reports. No score/who text colors were
removed. The gateway's login-format stripping only touches its private login
matching buffer. Plain MSDP labels/maps use copied buffers, preserving game
text and shared name strings. Native player color preferences remain in force.

Who player entries may include `staffTitle`, using the staff character's
custom staff title with its MUD color codes. It is omitted for mortals and
anonymous identities. The client renders it alongside the Staff label.
Active happy hours add `fields` under the `Happy hour` section, with remaining
time and each positive bonus (including crafting/harvesting-only events).
An inactive or expired happy hour adds no section. These additions use the
existing WHO_INFO payload and field renderer; older clients retain the full
command output fallback.

HELP_INFO may include `seeAlso: { text, entries: [{ label, topic? }] }`.
`text` is the original See Also section (including its display codes), used
to replace that section in place without losing surrounding content. Entries
always retain their labels, but only resolved, accessible help topics include
`topic`. The modal renders those as keyboard-accessible help links, sending
one `help <topic>` command and replacing the current help result. Missing or
restricted topics remain plain text. The body remains unchanged for terminal
fallback and older clients. Lookup is bounded to 32 references per response;
files exceeding that limit retain their original text. Wrapped, comma-separated
multiword topics and file aliases are supported. Dynamic help handlers are
probed in isolated captures, without publishing suggestions or extra MSDP events.

Quest history uses `QUEST_HISTORY` / `MudState.questHistory`. The Quests footer
requests `quest webhistory 0` (50 entries per page); text links request
`quest webhistorydetail <questId>`. List responses carry `id`, `kind: "list"`,
`entries: [{questId,name,available}]`, `total`, `page`, `pages`. Details carry
`kind: "detail"`, `questId`, `name`, `description`, `info`, `completion`.
Errors use `error`; all responses have unique IDs. The server permits details
only for the requesting character's saved completions. The Quest details
Windows preference routes the footer to terminal history when disabled.
