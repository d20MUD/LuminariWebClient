# Lore results modal

On Krynn, `lore <mob>` and `lore <object>` open a native browser dialog with
grouped native facts, including combat statistics, abilities, resistances,
feats and item properties. Full original output remains available in an
expandable section. Close, Escape, or a backdrop click dismisses
it. Consecutive results queue and disconnecting clears the queue.

The proxy opts into `LORE_INFO` alongside Krynn web help reports. The read-only
MSDP value is a JSON string with `id`, `topic`, `body`, and `truncated`, matching
the help response shape. IDs distinguish repeated requests for the same target.

The server captures the requesting player's normal lore output, including failure
messages, without changing target visibility checks, skill rolls, action costs,
identification, companion knowledge, or Dark Revelation effects. Non-subscribing
clients retain terminal output. The bounded capture also bypasses pagination;
truncated responses show a notice. Silent paths do not open an empty dialog.
This change applies to `lore`; other identification commands keep their behavior.

Both game server and browser proxy require rebuilding and restarting. No live
services are restarted by this source change.

See [Structured info MSDP](STRUCTURED_INFO_MSDP.md) for the current fields,
score/who windows and preferred ammunition command.
