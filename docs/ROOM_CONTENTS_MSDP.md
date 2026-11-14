# Krynn Room contents tab

The sidebar includes a Room contents tab on Krynn only, enabled by default and
configurable in Layout. It lists visible mobs, objects and other players by
short description, using the observer's normal view of identity. Click an entry
to reveal actions:

- Mobs: Attack, Fire, Lore, Look.
- Objects: Look, Examine, Read, plus Get when the object has the takeable flag.
- Players: Look.
- Surveyed harvest nodes: Harvest. Names shrink to fit a single line, with the
  full name available as a tooltip.

Actions use normal commands and their existing visibility, combat, action-cost,
carry-capacity and pickup checks. Attack sends `kill`. Lore uses the configured
lore modal. Other results use the main output. Hidden entities are omitted,
and changing room or disconnecting clears stale entries and selections.

The opt-in `ROOM_CONTENTS` MSDP JSON report has a numeric `room` vnum and an
`entries` array. Entries contain `target`, `kind`, `name`, and (for objects)
`takeable`. Exact targets `}c<ID>` and `}o<ID>` are matched only by normal local
visible-character or object-list lookup, avoiding duplicate-name mistakes.
Missing or departed targets fail normally instead of selecting another entity.
Object inspection resolves the selected object's own extra descriptions; Read
also targets it directly when a noticeboard is present.

The game report, proxy subscription, and tab are connected on dev port 4301.
Other MUD presets do not show the tab or request this report by default.

Harvest entries have `kind: "harvest"`, a room-scoped `target` such as `}h1005`,
and the same node name used by the MUD's survey display. They are emitted only
for a player with positive survey rooms remaining and a valid, non-depleted
resource in that room. Regular updates remove entries when survey knowledge
expires, the resource is depleted, or the player moves. No new subscription or
gateway change is needed.

The client validates the node's target against the report's room and offers
only the fixed `harvest` command, without appending a target or executing any
server-supplied command text. The existing harvest command checks surveying,
resources, tools and current tasks again before beginning work.
