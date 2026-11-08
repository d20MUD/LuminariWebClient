export type MudPreset = {
  id: string
  name: string
  host: string
  port: number
  description?: string
  features?: { questDetails?: boolean; helpModal?: boolean }
}

export type AppSettings = {
  ports: {
    client: number
    server: number
    preview: number
  }
  connection: {
    defaultHost: string
    defaultPort: number
    muds: MudPreset[]
  }
  personalization: {
    browserTitle: string
    eyebrow: string
    title: string
    subtitle: string
  }
}

export const appSettings: AppSettings = {
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
        features: { questDetails: true, helpModal: true },
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
    subtitle: 'by GickerLDS aka Steve Squires copyright 2026',
  },
}

/** Shared by Vite, the browser fallback, and the development proxy. */
export function getAppSettings(development: boolean): AppSettings {
  if (!development) return appSettings
  return {
    ...appSettings,
    ports: { ...appSettings.ports, client: 3211, server: 3212 },
    connection: {
      ...appSettings.connection,
      defaultPort: 4301,
      muds: appSettings.connection.muds.map((mud) =>
        mud.id === 'krynn' ? { ...mud, port: 4301 } : mud,
      ),
    },
  }
}
