// Lädt die aktuellen Abgeordnetendaten der Hamburgischen Bürgerschaft
// und schreibt eine kompakte Fassung nach data/abgeordnete.json.
// Aufruf: node scripts/update-data.mjs
import { writeFile } from "node:fs/promises";

const BASE = "https://www.hamburgische-buergerschaft.de";
const DATA_URL = `${BASE}/interaktive-wahlkreiskarte-806992!dataUrl`;
const OUT = new URL("../data/abgeordnete.json", import.meta.url);

const abs = (path) => (path ? new URL(path, BASE).href : "");
const website = (url) => {
  url = (url || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const res = await fetch(DATA_URL, { headers: { "User-Agent": "Mozilla/5.0 (Wahlkreiskarte GitHub Pages)" } });
if (!res.ok) throw new Error(`HTTP ${res.status} beim Abruf von ${DATA_URL}`);
const raw = await res.json();

const members = Object.values(raw)
  .map((m) => ({
    name: m.name,
    lastname: m.lastname,
    faction: m.faction,
    mandate: m.mandate,
    wk: m.constituency > 0 ? m.constituency : null,
    role: m.role || "",
    img: abs(m.imgSrc),
    email: m.email || "",
    website: website(m.website),
    profile: abs(m.memberProfileURL),
  }))
  .sort((a, b) => a.lastname.localeCompare(b.lastname, "de"));

if (members.length < 100) throw new Error(`Unplausible Anzahl Abgeordneter: ${members.length}`);

const out = { source: `${BASE}/ueber-uns/interaktive-wahlkreiskarte`, fetchedAt: new Date().toISOString(), members };
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${members.length} Abgeordnete gespeichert.`);
