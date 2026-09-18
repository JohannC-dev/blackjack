export type PublicTable = {
  id: string;
  label: string;
  description: string;
};

/**
 * Public rooms are deliberately stable codes so players can find the same
 * tables again. Any other valid table code remains available for private
 * rooms shared by invitation.
 */
export const PUBLIC_TABLES: readonly PublicTable[] = [
  {
    id: "MINUIT",
    label: "MINUIT",
    description: "La table principale",
  },
  {
    id: "LUNA",
    label: "LUNA",
    description: "Une table ouverte à tous",
  },
  {
    id: "NOVA",
    label: "NOVA",
    description: "Une table ouverte à tous",
  },
  {
    id: "OPALE",
    label: "OPALE",
    description: "Une table ouverte à tous",
  },
];

export const DEFAULT_PUBLIC_TABLE_ID = PUBLIC_TABLES[0].id;
