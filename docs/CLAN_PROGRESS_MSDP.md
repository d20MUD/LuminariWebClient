# Clan progression report and panel

Krynn alone subscribes to `CLAN_PROGRESS` with REPORT/SEND. The report is a bounded
version-1 JSON string, normalized through `shared/clan-progress.ts`. Unknown,
absent or malformed reports clear the view. Gateway renegotiation, character
changes and disconnects clear cached data; initial refresh and copyover restore
subscriptions. This does not enable progression on the MUD.

`status` is `ready`, `disabled`, `non_member` or `unavailable`; non-ready reports
contain only `version`, `status`, `reason` and `server_time`. Ready reports include:

- Own `character_id`, clan UID/name/level/XP/Influence and state revision.
- Own character Favor/standing and next standing threshold.
- Own account weekly usage and reset, six source counts and limits.
- Next buff/slot unlocks, current slots, and management permission.
- Five saved buff-family views, original expiry/cooldown times, cancellation
  availability, and three tiers with three slot choices/rejection explanations.

Eighth-point balances, revisions, usage and character IDs are decimal strings;
Unix times are safe integer seconds. Nullable next thresholds mean maximum tier.
`buff_state_available: false` hides unavailable saved buff data and disables
actions. The total report is limited to 49,152 bytes. No other member's private
state or account ID is exposed. The server uses a consistent targeted SQL read.

The configurable Clan tab keeps ordinary Player info as the initial tab. Labels
use plain escaped React text. New controls pause when disconnected, unsupported,
unavailable or over ten seconds since report arrival. The server normally
refreshes subscribed state every two seconds, and force-refreshes SEND/REPORT.

A reviewed action saves a random operation ID and restricted intent in session
storage before sending an existing `clan buffs` command. Retry preserves that
identity, clan and expected activation. No arbitrary report text becomes a
command and no currency/reward amount is supplied by the client. Replacement and
cancellation include the original target identity. The normal terminal response
is authoritative; pending retry state can be cleared explicitly after checking
it. The server repeats all eligibility/cost/cooldown/permission/staleness checks
in its atomic receipt-backed command services. Favor is never spent on buffs.

The C-generated JSON and MSDP frame fixtures in `tests/fixtures` come from
`code/tests/run_clan_web.py`; update them together with a deliberate protocol
change. Run `node --test tests/*.test.mjs`, `npm run build` and `npm run lint`.
No live service enablement, gateway restart or deployment accompanies this implementation.

Phases 46–47 add the optional `content` object (version 1). It contains three
contract family sections, expedition state and own claims, quartermaster
choices, live eligibility reasons, and server-issued delivery/purchase previews.
Malformed or absent extensions leave the core report usable. Each section has
bounded arrays and plain text; no arbitrary command strings are accepted.
`shared/clan-content.ts` builds fixed command verbs with validated catalog slugs,
outing/operation UIDs and purchase tokens. Existing `onAction` sends them through
the same input path as typed commands. No client action supplies reward amounts,
combat events, progress increments or completion declarations.

Saved gathering/bounty counts differ from eligible inventory displayed for a
delivery. Expedition credit also requires final-event participation, at least
two eligible finishers and unexpired original membership/weekly entitlements.
Quartermaster eligibility includes standing, levels, gold, capacity and normal
item restrictions. Server quote previews expire after 60 seconds. Final turn-in,
purchase and claim buttons ask for a second click; the server rechecks all gates
and deduplicates the saved receipt/outing identity. Start/leave/abandon remain
text commands; the active-roster button shows the existing text readout.

The buff category enum now exposes growth, recovery, combat and craft. The
client also accepts legacy utility labels. Reports remain private accepted-member
snapshots, bounded to 49152 bytes. All service defaults remain disabled.
