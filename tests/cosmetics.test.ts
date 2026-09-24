import { describe, expect, test } from "bun:test";
import { skinOf } from "../src/lib/cosmetics";
import {
  AssetError,
  MAX_ASSET_BYTES,
  assetHash,
  validateAsset,
} from "../server/cosmetics/assets";

const svg = (attributes: string, body = "") =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`,
  );

function png(width: number, height: number) {
  const data = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(data);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function webpLossless(width: number, height: number) {
  const data = Buffer.alloc(30);
  data.write("RIFF", 0, "ascii");
  data.write("WEBP", 8, "ascii");
  data.write("VP8L", 12, "ascii");
  data.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return data;
}

describe("validateAsset", () => {
  test("accepts a square SVG icon and a 5:7 card back", () => {
    expect(
      validateAsset("profile-icon", "icon.svg", svg('viewBox="0 0 64 64"')),
    ).toBe("image/svg+xml");
    expect(
      validateAsset("card-back", "back.svg", svg('width="250" height="350"')),
    ).toBe("image/svg+xml");
  });

  test("reads PNG and WebP dimensions", () => {
    expect(validateAsset("chicken", "c.png", png(128, 128))).toBe("image/png");
    expect(validateAsset("card-back", "b.webp", webpLossless(500, 700))).toBe(
      "image/webp",
    );
    expect(() => validateAsset("card-back", "b.png", png(128, 128))).toThrow(
      AssetError,
    );
  });

  test("refuses active content in an SVG", () => {
    for (const body of [
      "<script>alert(1)</script>",
      '<rect onload="alert(1)"/>',
      '<a href="javascript:alert(1)"/>',
      '<image href="https://example.com/x.png"/>',
      "<foreignObject></foreignObject>",
    ])
      expect(() =>
        validateAsset("mine-gem", "g.svg", svg('viewBox="0 0 10 10"', body)),
      ).toThrow(AssetError);
  });

  test("refuses unknown formats, oversized and unreadable files", () => {
    expect(() => validateAsset("chicken", "c.gif", png(10, 10))).toThrow(
      /SVG, PNG ou WebP/,
    );
    expect(() =>
      validateAsset("chicken", "c.png", Buffer.alloc(MAX_ASSET_BYTES + 1)),
    ).toThrow(/maximum/);
    expect(() =>
      validateAsset("chicken", "c.png", Buffer.from("not a png")),
    ).toThrow(/illisibles/);
  });

  test("the hash follows the content", () => {
    expect(assetHash(png(1, 1))).toBe(assetHash(png(1, 1)));
    expect(assetHash(png(1, 1))).not.toBe(assetHash(png(2, 2)));
  });
});

describe("skinOf", () => {
  test("an owner's skin wins over the viewer's", () => {
    expect(
      skinOf({ "card-back": "owner" }, { "card-back": "viewer" }, "card-back"),
    ).toBe("owner");
  });

  test("a player without one shows the viewer's, or the Classique", () => {
    expect(skinOf({}, { "card-back": "viewer" }, "card-back")).toBe("viewer");
    expect(skinOf(undefined, {}, "card-back")).toBeUndefined();
  });
});
