import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "play-store/feature-graphic.png");
const svg = Buffer.from(`
  <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#101D45"/>
        <stop offset="1" stop-color="#174EA6"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="500" rx="28" fill="url(#bg)"/>
    <circle cx="895" cy="80" r="200" fill="#77BDFC" opacity=".12"/>
    <circle cx="930" cy="435" r="150" fill="#B8DDFB" opacity=".1"/>
    <path d="M710 170c40-28 82-28 122 0v170c-40-28-82-28-122 0z" fill="none" stroke="#D9EDFF" stroke-width="12" stroke-linejoin="round"/>
    <path d="M832 170c40-28 82-28 122 0v170c-40-28-82-28-122 0z" fill="none" stroke="#D9EDFF" stroke-width="12" stroke-linejoin="round"/>
    <path d="M832 172v172" stroke="#8EC9FF" stroke-width="9"/>
    <text x="72" y="190" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="62" font-weight="700">MINA TEACH AI</text>
    <text x="74" y="247" fill="#D5E9FF" font-family="Arial, sans-serif" font-size="27">Dhaloota beekumsa omishuudha.</text>
    <path d="M74 288h490" stroke="#8EC9FF" stroke-width="6" stroke-linecap="round"/>
    <text x="74" y="350" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="25">LEARN  ·  PRACTICE  ·  GROW</text>
    <text x="74" y="404" fill="#D5E9FF" font-family="Arial, sans-serif" font-size="22">Grades 9–12 · English · Afaan Oromoo · Amharic</text>
  </svg>
`);
await mkdir(resolve(root, "play-store"), { recursive: true });
await sharp(svg).png().toFile(output);
console.log("Created play-store/feature-graphic.png (1024×500).");
