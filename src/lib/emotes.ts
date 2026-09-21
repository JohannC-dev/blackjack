/**
 * Emotes are purely cosmetic: the server relays them to the table without
 * storing anything, and they never touch the game state.
 *
 * A "throw" flies from the sender's seat to a target player and bursts on
 * impact; a "reaction" pops above the sender's seat.
 */
export type EmoteKind = "throw" | "reaction";
export type EmoteGame = "blackjack" | "poker";

export type EmoteDefinition = {
  id: string;
  kind: EmoteKind;
  glyph: string;
  label: string;
  /** What is left on the target after a throw (a splat, hearts…). */
  impact?: string;
  /** Particle colours of the impact burst. */
  colors?: string[];
};

export const EMOTES: readonly EmoteDefinition[] = [
  {
    id: "snowball",
    kind: "throw",
    glyph: "❄️",
    label: "Boule de neige",
    impact: "💥",
    colors: ["#ffffff", "#dff3ff", "#a9d8ff"],
  },
  {
    id: "tomato",
    kind: "throw",
    glyph: "🍅",
    label: "Tomate",
    impact: "💦",
    colors: ["#e3342f", "#ff6b4a", "#7ec850"],
  },
  {
    id: "egg",
    kind: "throw",
    glyph: "🥚",
    label: "Œuf",
    impact: "🍳",
    colors: ["#fff7e0", "#ffd23f", "#f5e6c8"],
  },
  {
    id: "shoe",
    kind: "throw",
    glyph: "🩴",
    label: "Tong",
    impact: "💫",
    colors: ["#ffd23f", "#ffffff", "#c6a25f"],
  },
  {
    id: "kiss",
    kind: "throw",
    glyph: "💋",
    label: "Bisou",
    impact: "😘",
    colors: ["#ff4f8b", "#ff9fc2", "#ffffff"],
  },
  {
    id: "rose",
    kind: "throw",
    glyph: "🌹",
    label: "Rose",
    impact: "💖",
    colors: ["#e3342f", "#ff9fc2", "#4caf50"],
  },
  {
    id: "beer",
    kind: "throw",
    glyph: "🍺",
    label: "Tournée",
    impact: "🍻",
    colors: ["#f5b82e", "#fff7e0", "#ffffff"],
  },
  {
    id: "poop",
    kind: "throw",
    glyph: "💩",
    label: "Cadeau",
    impact: "🤢",
    colors: ["#7a4a24", "#a0692f", "#5a3517"],
  },
  { id: "fuck", kind: "reaction", glyph: "🖕", label: "Fuck" },
  { id: "lol", kind: "reaction", glyph: "😂", label: "MDR" },
  { id: "cry", kind: "reaction", glyph: "😭", label: "Ouin" },
  { id: "rage", kind: "reaction", glyph: "🤬", label: "Rage" },
  { id: "clown", kind: "reaction", glyph: "🤡", label: "Clown" },
  { id: "salt", kind: "reaction", glyph: "🧂", label: "Salty" },
  { id: "fire", kind: "reaction", glyph: "🔥", label: "En feu" },
  { id: "money", kind: "reaction", glyph: "🤑", label: "Money" },
  { id: "popcorn", kind: "reaction", glyph: "🍿", label: "Popcorn" },
  { id: "skull", kind: "reaction", glyph: "💀", label: "Mort" },
  { id: "sleep", kind: "reaction", glyph: "🥱", label: "Zzz" },
  { id: "gg", kind: "reaction", glyph: "👏", label: "GG" },
];

export const EMOTE_BY_ID = new Map(EMOTES.map((emote) => [emote.id, emote]));

/** Sent by the client. */
export type EmoteRequest = {
  game: EmoteGame;
  emote: string;
  targetId?: string;
};

/** Relayed by the server to every player of the table. */
export type EmoteEvent = {
  id: string;
  game: EmoteGame;
  emote: string;
  fromId: string;
  fromName: string;
  targetId?: string;
};

/** An emote as kept by the client until it is animated. */
export type ReceivedEmote = EmoteEvent & { receivedAt: number };
