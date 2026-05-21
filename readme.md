# LuminariWebClient

LuminariWebClient is a web-based MUD client for **LuminariMUD-compatible** games. It combines a React frontend with a Node WebSocket/Telnet proxy so a browser can connect to a Telnet MUD while still getting live MSDP-driven HUD data.

## Features

- Browser terminal with ANSI-colored game output
- Compact responsive layout optimized for smaller screens
- Auto-collapsing header after connect, with a small show/hide toggle
- Layout menu with persisted display controls for:
  - minimalist mode
  - graphic map, graphic legend, ASCII map, and ASCII legend tabs
  - Player info, Quests, Group, and Affects sidebar tabs
  - Player info sections including character name, race, class, ability scores, saving throws, position, attack, armor class, alignment, and money
  - sidebar width using either a percentage or fixed pixel value
  - one-click All on / All off layout toggles
- Compact HUD with HP, PSP, movement, EXP, opponent, and tank bars
- Tank and opponent gauges with overlaid names
- MSDP-driven **MINIMAP** display
- Character tab with MSDP-fed profile and ability score grid (STR/DEX/CON/INT/WIS/CHA)
- Sidebar tabs for Character, Quests, Group, and Affects
- Group tab formatting with per-member spacing, leader marker, and compact stat line (`Health x/y Move a/b`)
- Quest tab HTML rendering for structured quest payloads (including JSON string/array/object data)
  - Displays quest name, type, vnum (no commas), progress as `completed/required`, and targets as comma-separated names
  - Hides `slot`, `time_remaining`, target IDs, and field labels
- Affects tab rendering for nested MSDP data
- Character title display with smart name/title composition:
  - If `TITLE` contains the character name, shows the title only
  - If `TITLE` is set but does not contain the character name, shows `Name Title`
  - If `TITLE` is not set, shows the character name alone
- Customizable key bindings with default numpad movement and look mappings
- Command history with ArrowUp / ArrowDown
- Tab completion: pressing Tab autocompletes from the most recent matching command in history
- Movement commands excluded from command history
- Click-anywhere focus behavior for the command input
- MUD preset dropdown plus manual host/port entry
- Luminari `^` color-code rendering in non-terminal UI text
- Shared settings file for ports, defaults, presets, and personalization
- Node proxy that negotiates MSDP and bridges browser WebSocket traffic to the MUD

## Client layout settings

The **Layout** top menu lets players tailor the right-side UI without editing code.

- toggle **Minimalist mode**
- show or hide each map tab and legend independently
- show or hide the **Player info**, **Quests**, **Group**, and **Affects** sidebar tabs
- choose which details appear inside **Player info**
- set the sidebar width as either:
  - a percentage of the main layout
  - a fixed pixel width
- use **All on** or **All off** to quickly enable or disable all layout-controlled panels and sections

These layout preferences are stored with the normal client settings, so they persist in cookies and are included when saving or loading a full client settings file.

## Architecture

Browsers cannot talk to a Telnet MUD directly, so the app is split into two parts:

1. **React + Vite frontend**
2. **Node proxy server**

The proxy:

- accepts browser WebSocket connections at `/ws`
- connects to the MUD over Telnet
- negotiates MSDP
- requests the variables the UI needs
- forwards terminal output and structured MSDP updates back to the browser

## Setup

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

This starts:

- the Vite frontend on the client port from `shared/app-settings.ts`
- the Node proxy on the server port from `shared/app-settings.ts`

Vite proxies `/ws` traffic to the Node server automatically during development.

## Production build and run

Build the production version:

```bash
npm run build
```

Run the built app:

```bash
npm start
```

`npm start` serves both:

- the built frontend
- the WebSocket/Telnet proxy

## Running with PM2

The PM2 command that works for this app is:

```bash
pm2 start dist/server/index.js --name luminari-web-client
```

Recommended full flow:

```bash
npm install
npm run build
pm2 start dist/server/index.js --name luminari-web-client
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs luminari-web-client
pm2 restart luminari-web-client
pm2 stop luminari-web-client
pm2 delete luminari-web-client
pm2 save
pm2 startup
```

To run on a different port:

```bash
PORT=4000 pm2 start dist/server/index.js --name luminari-web-client
```

An optional PM2 ecosystem file also exists:

```bash
ecosystem.config.cjs
```

## Configuration

The main app settings file is:

```ts
shared/app-settings.ts
```

The browser now loads these settings from the server at runtime through `/api/settings`, so changes to MUD presets, defaults, and personalization are picked up after restarting the server. A full frontend rebuild is not required just to update the dropdown list or branding text.

It contains:

- **ports.client** - Vite dev server port
- **ports.server** - Node proxy / production HTTP server port
- **ports.preview** - Vite preview port
- **connection.defaultHost** - default host shown in the client
- **connection.defaultPort** - default port shown in the client
- **connection.muds** - optional preset list for the MUD dropdown
- **personalization.browserTitle** - browser tab title
- **personalization.eyebrow** - small heading label in the UI
- **personalization.title** - main page title
- **personalization.subtitle** - descriptive subtitle text

### Current default config values

```ts
export const appSettings = {
  ports: {
    client: 5173,
    server: 3210,
    preview: 4173,
  },
  connection: {
    defaultHost: 'krynn.d20mud.com',
    defaultPort: 4300,
    muds: [
      {
        id: 'krynn',
        name: 'Chronicles of Krynn',
        host: 'krynn.d20mud.com',
        port: 4300,
        description: 'Post War of the Lance Dragonlance RP and Adventuring.',
      },
      {
        id: 'luminari',
        name: 'LuminariMUD',
        host: 'LuminariMUD.com',
        port: 4100,
        description: 'MUD running the LuminariMUD codebase in the world of Lumia.',
      },
      {
        id: 'faerun',
        name: 'Faerun: A Forgotten Realms MUD',
        host: 'faerun.d20mud.com',
        port: 3100,
        description: 'Forgotten Realms Adventuring in Western Faerun.',
      },
      {
        id: 'starwars',
        name: 'd20MUD: Star Wars',
        host: 'starwars.d20mud.com',
        port: 5500,
        description: 'Galactic Empire Star Wars using d20-based rules.',
      },
    ],
  },
  personalization: {
    browserTitle: 'd20MUD Web Clients',
    eyebrow: '',
    title: 'd20MUD Web Clients',
    subtitle: '',
  },
}
```

## Environment overrides

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `shared/app-settings.ts` value | Override the server HTTP/WebSocket port |
| `VITE_WS_URL` | same-origin `/ws` | Override the browser WebSocket target |

## MUD presets

Preset MUDs are configured in:

```ts
shared/app-settings.ts
```

Each preset uses:

```ts
{
  id: string
  name: string
  host: string
  port: number
  description?: string
}
```

If presets are defined, the web client shows a dropdown beside the host, port, and connect controls. The user can still switch to **Custom** and type a host and port manually.

## MSDP / HUD coverage

The client currently uses MSDP for these categories:

- **Character:** `CHARACTER_NAME`, `TITLE`, `LEVEL`, `CLASS`, `RACE`, `POSITION`, `ALIGNMENT`, `MONEY`, `AC`, `ATTACK_BONUS`
- **Ability scores:** `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA`, `STRENGTH`, `DEXTERITY`, `CONSTITUTION`, `INTELLIGENCE`, `WISDOM`, `CHARISMA`
- **Bars:** `HEALTH`, `HEALTH_MAX`, `PSP`, `PSP_MAX`, `MOVEMENT`, `MOVEMENT_MAX`, `EXPERIENCE`, `EXPERIENCE_MAX`, `EXPERIENCE_TNL`
- **Combat:** `OPPONENT_NAME`, `OPPONENT_HEALTH`, `OPPONENT_HEALTH_MAX`, `TANK_NAME`, `TANK_HEALTH`, `TANK_HEALTH_MAX`
- **Room and map:** `ROOM`, `ROOM_NAME`, `AREA_NAME`, `ROOM_VNUM`, `ROOM_EXITS`, `MINIMAP`
- **Group and status collections:** `GROUP`, `AFFECTS`, `ACTIONS`, `QUEST_INFO`

Server-level fields such as `SERVER_ID` are also requested so the bridge can validate the connection before character login completes.

## Verified commands

```bash
npm run lint
npm run build
```
