// Stellt die statische Seite in _site/ zusammen und erzeugt kleine
// WebP-Vorschaubilder der Abgeordnetenfotos (die Originale sind ~0,5 MB groß).
// Schlägt ein Bild fehl, bleibt der Link auf das Original erhalten.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const site = new URL("_site/", root);
const SIZE = 160;

await rm(site, { recursive: true, force: true });
await mkdir(new URL("img/", site), { recursive: true });
for (const f of ["index.html", "style.css", "app.js", "data"]) {
  await cp(new URL(f, root), new URL(f, site), { recursive: true });
}
await writeFile(new URL(".nojekyll", site), "");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("sharp nicht installiert – Fotos werden direkt verlinkt.");
  process.exit(0);
}

const dataFile = new URL("data/abgeordnete.json", site);
const data = JSON.parse(await readFile(dataFile, "utf8"));
let ok = 0;

async function thumb(m) {
  if (!m.img) return;
  try {
    const res = await fetch(m.img, { headers: { "User-Agent": "Mozilla/5.0 (Wahlkreiskarte GitHub Pages)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const name = `${createHash("sha1").update(m.img).digest("hex").slice(0, 12)}.webp`;
    await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(SIZE, SIZE, { fit: "cover", position: "top" })
      .webp({ quality: 78 })
      .toFile(new URL(`img/${name}`, site).pathname);
    m.img = `img/${name}`;
    ok++;
  } catch (err) {
    console.warn(`Foto für ${m.name} übersprungen: ${err.message}`);
  }
}

const queue = [...data.members];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) await thumb(queue.shift());
}));
await writeFile(dataFile, JSON.stringify(data));
console.log(`_site/ erstellt, ${ok}/${data.members.length} Vorschaubilder.`);
