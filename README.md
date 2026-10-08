# Wahlkreiskarte Hamburg

Responsive Web-App, die die 17 Wahlkreise der Hamburgischen Bürgerschaft auf einer Karte zeigt –
mit den direkt gewählten Abgeordneten je Wahlkreis. Über das Adressfeld (oder per Standort / Klick
in die Karte) findet man den eigenen Wahlkreis und seine Abgeordneten.

Inspiriert von der [interaktiven Wahlkreiskarte der Bürgerschaft](https://www.hamburgische-buergerschaft.de/ueber-uns/interaktive-wahlkreiskarte).

## Aufbau

Reine statische Seite ohne Build-Schritt:

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Oberfläche (Leaflet-Karte, Adresssuche, Abgeordnetenliste) |
| `data/wahlkreise.geojson` | Wahlkreisgrenzen (WGS84, vereinfacht) |
| `data/abgeordnete.json` | Abgeordnete inkl. Fraktion, Wahlkreis, Kontakt |
| `scripts/update-data.mjs` | Lädt die Abgeordnetendaten neu von der Bürgerschaft |
| `scripts/build.mjs` | Baut die Seite nach `_site/` inkl. kleiner WebP-Fotos |

Die Wahlkreiszuordnung einer Adresse passiert komplett im Browser (Punkt-in-Polygon).
Für die Umwandlung von Adresse in Koordinaten wird [Photon](https://photon.komoot.io) (OpenStreetMap) verwendet.

## Lokal starten

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Daten aktualisieren

```sh
npm install
npm run update-data   # Abgeordnete neu laden
npm run build         # Seite nach _site/ bauen
```

## Deployment

Der Workflow `.github/workflows/pages.yml` lädt bei jedem Push auf `main`, wöchentlich und auf Knopfdruck
die aktuellen Daten, baut die Seite und veröffentlicht sie auf dem Branch `gh-pages`.

Einmalig in den Repository-Einstellungen unter **Settings → Pages → Build and deployment**
„**Deploy from a branch**“ mit Branch **`gh-pages`** / **`/ (root)`** auswählen (falls GitHub das nicht
schon automatisch eingestellt hat).

## Quellen & Lizenzen

- Abgeordnetendaten: [Hamburgische Bürgerschaft](https://www.hamburgische-buergerschaft.de/ueber-uns/interaktive-wahlkreiskarte)
- Wahlkreisgrenzen: © Statistisches Amt für Hamburg und Schleswig-Holstein, 2025 –
  [Geometrien der Wahlkreise zur Bürgerschaftswahl 2025](https://suche.transparenz.hamburg.de/dataset/geometrien-der-wahlkreise-zur-burgerschaftswahl-2025)
  (Datenlizenz Deutschland – Namensnennung – 2.0), von EPSG:25832 nach WGS84 umprojiziert und vereinfacht
- Kartenhintergrund: © OpenStreetMap-Mitwirkende

Dies ist ein inoffizielles Projekt und steht in keiner Verbindung zur Hamburgischen Bürgerschaft.
