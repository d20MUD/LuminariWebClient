# Krynn web character creation

Choose **Create new character** in the Saved characters dialog. Sign in to an
existing Krynn account; optionally save the completed character's login on this
device. Account credentials are otherwise kept only for the login handoff and
cleared after authentication. This action creates a character, not a new account.

The game server sends `CHARACTER_CREATION` reports for the normal creation flow:
name, confirmation, gender, race, class, build, alignment, preferences, and later
character-customization menus. Race and class cards use portraits from
https://krynn.d20mud.com/races/ and https://krynn.d20mud.com/classes/.
Only playable races available to the authenticated account are sent. Starting
classes must be in-game, non-prestige, unlocked, and compatible with the race.
All submissions still pass the existing game validation.

**Previous** returns through the core choices before creation. Changing earlier
choices resets dependent build selections and recomputes eligible choices.
Choosing alignment creates and saves the character; the UI states this before
that choice. Later customization screens return to their setup menu. Active
text editors use their normal save/cancel commands before navigation, preserving
the existing editor behavior. The generic response field supports every remaining
menu or editor command, with recognized menu options also shown as buttons.

Minimizing the dialog restores subsequent captured prompts to the main output.
Use **Character creation** in the top menu to reopen it. Normal telnet creation
is unchanged for clients that do not opt into the report. Completion restores
the normal main output and can save a login profile if explicitly requested.

Protocol fields: `id`, `active`, `canBack`, `state`, `step`, `title`, `name`,
`body`, `truncated`, and `choices` (`value`, `label`, `description`). The gateway
uses a `create-character` request containing account credentials, sends C only at
the authenticated account menu, and then stops automation. It never confirms
creation of an unknown account. The game processes `@creation-back` only in an
active web creation flow; it cannot rewind a saved character's core creation.

The account-menu detector accepts the real `(C)reate a new character` shortcut
spelling, including color codes and fragmented network reads. It waits for
`Your choice:` before subscribing and sending C. Manual input cancels that
pending handoff. Login forms use compact controls and inline action rows; the
creation dialog uses most of the screen width on every step.

All creation prose uses the shared modal text flow: single source line breaks
are joined within prose paragraphs; ability lists, proficiency lists, statistics,
and blank lines keep their separate lines. Long content wraps
to the available width without horizontal scrolling. The same behavior applies
to quest, help, and lore dialogs.

Race cards show the portrait and name. Class cards retain their summaries and
are ordered alphabetically. Selecting either requests the server help text before
confirmation. File-based help matches aliases anywhere in the keyword list.

Race and class confirmation help preserves the original line breaks, spacing,
and decorative lines, parsing only MUD color/protocol codes. Long lines scroll
horizontally within the help text instead of wrapping or reflowing.
