// Lädt die aktuellen Abgeordnetendaten der Hamburgischen Bürgerschaft
// und schreibt eine kompakte Fassung nach data/abgeordnete.json.
//
// Für Abgeordnete mit Listenmandat wird zusätzlich über abgeordnetenwatch.de
// (Lizenz CC0) ermittelt, in welchem Wahlkreis sie 2025 kandidiert haben
// (Feld `listWk`). Wohnorte werden nicht veröffentlicht – die Kandidatur ist
// die beste öffentlich verfügbare Zuordnung.
//
// Aufruf: node scripts/update-data.mjs
import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://www.hamburgische-buergerschaft.de";
const DATA_URL = `${BASE}/interaktive-wahlkreiskarte-806992!dataUrl`;
const AW_API = "https://www.abgeordnetenwatch.de/api/v2";
const AW_PARLIAMENT_HAMBURG = 3;
const OUT = new URL("../data/abgeordnete.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (Wahlkreiskarte GitHub Pages)" };

const abs = (path) => (path ? new URL(path, BASE).href : "");
const website = (url) => {
  url = (url || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

async function getJson(url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status} beim Abruf von ${url}`);
      return await res.json();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// "Prof. Dr. Anna-Lena  Müller-Möller" -> ["anna", "lena", "muller", "moller"]
const nameParts = (name) =>
  name
    .replace(/\b(Prof|Dr)\.\s*/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Liefert Map "Name laut Bürgerschaft" -> Wahlkreisnummer der Kandidatur 2025. */
async function fetchCandidacyDistricts(members) {
  const parliament = await getJson(`${AW_API}/parliaments/${AW_PARLIAMENT_HAMBURG}`);
  const period = parliament.data.current_project.id;
  const mandates = (await getJson(`${AW_API}/candidacies-mandates?parliament_period=${period}&type=mandate&range_end=500`)).data;

  const entries = mandates.map((m) => ({
    parts: nameParts(m.politician.label),
    wk: Number.parseInt(m.electoral_data?.constituency?.label, 10) || null,
  }));

  const result = new Map();
  for (const member of members) {
    const parts = nameParts(member.name);
    const last = parts.at(-1);
    // Nachname muss übereinstimmen (auch Teil eines Doppelnamens), Vorname möglichst auch.
    const byLast = entries.filter((e) => e.parts.includes(last) || parts.includes(e.parts.at(-1)));
    const match = byLast.find((e) => e.parts[0] === parts[0]) ?? (byLast.length === 1 ? byLast[0] : null);
    if (match?.wk) result.set(member.name, match.wk);
  }
  return result;
}

const raw = await getJson(DATA_URL);
const members = Object.values(raw)
  .map((m) => ({
    name: m.name.replace(/\s+/g, " ").trim(),
    lastname: m.lastname.trim(),
    faction: m.faction,
    mandate: m.mandate,
    wk: m.constituency > 0 ? m.constituency : null,
    listWk: null,
    role: m.role || "",
    img: abs(m.imgSrc),
    email: m.email || "",
    website: website(m.website),
    profile: abs(m.memberProfileURL),
  }))
  .sort((a, b) => a.lastname.localeCompare(b.lastname, "de"));

if (members.length < 100) throw new Error(`Unplausible Anzahl Abgeordneter: ${members.length}`);

const listMembers = members.filter((m) => !m.wk);
let candidacies;
try {
  candidacies = await fetchCandidacyDistricts(listMembers);
} catch (err) {
  // abgeordnetenwatch nicht erreichbar: bisherige Zuordnung weiterverwenden.
  console.warn(`abgeordnetenwatch nicht erreichbar (${err.message}) – bisherige Zuordnung bleibt.`);
  const previous = JSON.parse(await readFile(OUT, "utf8").catch(() => '{"members":[]}')).members;
  candidacies = new Map(previous.filter((m) => m.listWk).map((m) => [m.name, m.listWk]));
}
for (const m of listMembers) m.listWk = candidacies.get(m.name) ?? null;

const out = {
  source: `${BASE}/ueber-uns/interaktive-wahlkreiskarte`,
  candidacySource: "https://www.abgeordnetenwatch.de/hamburg",
  fetchedAt: new Date().toISOString(),
  members,
};
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${members.length} Abgeordnete gespeichert, ${candidacies.size}/${listMembers.length} Listen-Abgeordnete mit Wahlkreiskandidatur.`);
