import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const source = path.join(assets, "icon.png");
const emblem = path.join(assets, "zelo-icon.svg");
const brand = "#0878F9";

await sharp(source)
  .resize(1024, 1024)
  .png({ compressionLevel: 9 })
  .toFile(path.join(assets, "splash-icon.png"));

await sharp(source)
  .resize(196, 196)
  .png({ compressionLevel: 9 })
  .toFile(path.join(assets, "favicon.png"));

await sharp({ create: { width: 1024, height: 1024, channels: 3, background: brand } })
  .png()
  .toFile(path.join(assets, "android-icon-background.png"));

await sharp(emblem)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(assets, "android-icon-foreground.png"));

await sharp(emblem)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .greyscale()
  .png()
  .toFile(path.join(assets, "android-icon-monochrome.png"));

console.log("Derived Zelo icons from Figma app icon in", assets);
