import { createHash } from "node:crypto";
import type { CosmeticKind } from "../../src/lib/cosmetics";

/** A card back or an icon weighs a few dozen kilobytes. */
export const MAX_ASSET_BYTES = 256 * 1024;

const ASSET_TYPES = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

type AssetContentType = (typeof ASSET_TYPES)[keyof typeof ASSET_TYPES];

/** Width over height each kind is drawn at. */
const ASSET_RATIOS: Record<CosmeticKind, number> = {
  "card-back": 5 / 7,
  "profile-icon": 1,
  chicken: 1,
  "mine-gem": 1,
};

const RATIO_TOLERANCE = 0.03;

export class AssetError extends Error {}

type Size = { width: number; height: number };

function pngSize(data: Buffer): Size | null {
  const signature = "89504e470d0a1a0a";
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== signature)
    return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function webpSize(data: Buffer): Size | null {
  if (
    data.length < 30 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  )
    return null;
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return {
      width: 1 + data.readUIntLE(24, 3),
      height: 1 + data.readUIntLE(27, 3),
    };
  if (chunk === "VP8 ")
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function svgSize(text: string): Size | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return null;
  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (viewBox) {
    const [, , width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (width! > 0 && height! > 0) return { width: width!, height: height! };
  }
  const width = Number(/\bwidth\s*=\s*["']([\d.]+)/i.exec(root)?.[1]);
  const height = Number(/\bheight\s*=\s*["']([\d.]+)/i.exec(root)?.[1]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * What an SVG may not carry. It is only ever drawn through <img>, where none
 * of this runs, but a skin has no business holding it either.
 */
const SVG_FORBIDDEN =
  /<script\b|<foreignObject\b|javascript:|\bon[a-z]+\s*=|(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i;

/**
 * Checks a picture before it enters the catalogue: known format, size,
 * shape of its kind, and no active content in an SVG.
 */
export function validateAsset(
  kind: CosmeticKind,
  fileName: string,
  data: Buffer,
): AssetContentType {
  const extension = /\.[^.]+$/.exec(fileName.toLowerCase())?.[0] ?? "";
  const contentType = ASSET_TYPES[extension as keyof typeof ASSET_TYPES];
  if (!contentType)
    throw new AssetError(`${fileName} : format accepté SVG, PNG ou WebP.`);
  if (data.length > MAX_ASSET_BYTES)
    throw new AssetError(
      `${fileName} : ${Math.ceil(data.length / 1024)} Ko, maximum ${MAX_ASSET_BYTES / 1024} Ko.`,
    );

  let size: Size | null;
  if (contentType === "image/svg+xml") {
    const text = data.toString("utf8");
    if (SVG_FORBIDDEN.test(text))
      throw new AssetError(
        `${fileName} : le SVG contient du script, un objet étranger ou un lien externe.`,
      );
    size = svgSize(text);
  } else size = contentType === "image/png" ? pngSize(data) : webpSize(data);
  // A zero side would make the ratio NaN, which slips through the check.
  if (
    !size ||
    !(Number.isFinite(size.width) && size.width > 0) ||
    !(Number.isFinite(size.height) && size.height > 0)
  )
    throw new AssetError(
      `${fileName} : dimensions illisibles ou fichier invalide.`,
    );

  const expected = ASSET_RATIOS[kind];
  const ratio = size.width / size.height;
  if (Math.abs(ratio - expected) / expected > RATIO_TOLERANCE)
    throw new AssetError(
      `${fileName} : ${size.width}×${size.height}, attendu un rapport ${kind === "card-back" ? "5:7" : "carré"}.`,
    );
  return contentType;
}

/** Versions the asset URL: a new picture gets a new URL. */
export function assetHash(data: Buffer) {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}
