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
