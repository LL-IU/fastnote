// 从 design/icon.svg 生成 src-tauri/icons/ 下的全部图标资产。
// 用法: node scripts/generate-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "design", "icon.svg"), "utf8");

const outDir = join(root, "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

function renderPng(size) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  return r.render().asPng();
}

function writePng(name, size) {
  writeFileSync(join(outDir, name), renderPng(size));
  console.log(`${name}  <-  ${size}x${size}`);
}

// ---- tauri.conf bundle.icon 引用的 PNG ----
writePng("32x32.png", 32);
writePng("64x64.png", 64);
writePng("128x128.png", 128);
writePng("128x128@2x.png", 256);
writePng("icon.png", 512);

// ---- MSIX/商店遗留 Square 资产(保持同名同尺寸,避免引用悬空) ----
writePng("Square30x30Logo.png", 30);
writePng("Square44x44Logo.png", 44);
writePng("Square71x71Logo.png", 71);
writePng("Square89x89Logo.png", 89);
writePng("Square107x107Logo.png", 107);
writePng("Square142x142Logo.png", 142);
writePng("Square150x150Logo.png", 150);
writePng("Square284x284Logo.png", 284);
writePng("Square310x310Logo.png", 310);
writePng("StoreLogo.png", 50);

// ---- icon.ico:PNG 内嵌多尺寸(Vista+) ----
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
{
  const pngs = icoSizes.map(renderPng);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach((png, i) => {
    const s = icoSizes[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // width (0 = 256)
    e.writeUInt8(s >= 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  });
  writeFileSync(join(outDir, "icon.ico"), Buffer.concat([header, ...entries, ...pngs]));
  console.log(`icon.ico  <-  ${icoSizes.join("/")}`);
}

// ---- icon.icns:PNG 内嵌(ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14) ----
{
  const types = [
    ["ic11", 32],
    ["ic12", 64],
    ["ic07", 128],
    ["ic13", 256],
    ["ic08", 256],
    ["ic09", 512],
    ["ic14", 512],
    ["ic10", 1024],
  ];
  const chunks = types.map(([type, size]) => {
    const body = renderPng(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(body.length + 8, 4);
    return Buffer.concat([head, body]);
  });
  const table = Buffer.alloc(8);
  table.write("icns", 0, "ascii");
  table.writeUInt32BE(chunks.reduce((n, c) => n + c.length, 0) + 8, 4);
  writeFileSync(join(outDir, "icon.icns"), Buffer.concat([table, ...chunks]));
  console.log("icon.icns  <-  ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14");
}

// ---- 预览图(方便人工检查) ----
mkdirSync(join(root, "design", "preview"), { recursive: true });
for (const s of [16, 24, 32, 48, 64, 128, 256]) {
  writeFileSync(join(root, "design", "preview", `preview-${s}.png`), renderPng(s));
}
console.log("preview images -> design/preview/");
