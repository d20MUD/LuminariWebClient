# Windows menu

The Krynn menu bar includes **Windows** with checked options for Help, Lore,
Quest acceptance, Quest completion, Available quests, and Quest details.
**All on** and **All off** switch every output window at once. Preferences are
saved with the client settings cookies and included in configuration exports.
Old configurations default every window to on.

With a window off:

- Help and lore responses appear in the main output instead of a dialog. Their
  reports remain subscribed because the server captures this output for the web
  client; discarding the report would lose the response.
- Quest acceptance/completion retain their existing main output and do not queue
  a popup. This avoids printing the same server text a second time.
- View quests prints the available quests in the main output, including explicit
  join commands. Clicking a quest in the Quests tab prints its details there.

Switching off help or lore also prints any pending captured responses. Disabled
quest notifications are removed from the queue so they cannot reopen later.
Choices apply immediately without reconnecting or changing the game server.
