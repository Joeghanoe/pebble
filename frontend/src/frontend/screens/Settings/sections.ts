/**
 * The settings screen's sections, in nav order. Ordered from the harmless to the
 * irreversible: the account and data section, with the reset, is last.
 */
export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "How numbers are shown, and how often quotes are pulled.",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Purple chrome, orange actions. Pebble is built dark-first.",
  },
  {
    id: "strategy",
    label: "Strategy",
    description:
      "The target, the monthly contribution, and what each scenario assumes.",
  },
  {
    id: "dca",
    label: "DCA rule",
    description:
      "BTC measured against its moving average decides how each contribution splits.",
  },
  {
    id: "profit",
    label: "Profit taking",
    description:
      "When the Strategy page suggests trimming BTC. A signal, never an order.",
  },
  {
    id: "exchanges",
    label: "Exchanges",
    description: "Where each position is held.",
  },
  {
    id: "account",
    label: "Account & data",
    description:
      "Sign-in, export, and putting the settings back to their defaults.",
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];
