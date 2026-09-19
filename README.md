# BilalAbiTV VTuber

Web-basierter 2D-VTuber-Avatar für TikTok-Videos. Läuft komplett im Safari-Browser auf dem iPhone, kein PC und keine App nötig. Das Gesicht wird per Frontkamera mit MediaPipe Face Landmarker getrackt und auf einen SVG-Charakter übertragen.

## Funktionen

- Mund (Öffnung + Breite), Blinzeln, Blickrichtung, Kopf neigen/drehen/nicken, Augenbrauen, Idle-Atmen
- Fünf Stimmungen: Neutral, Glücklich, Enttäuscht, Sauer, Fraglich
- Drei Trikots (Saison 2026/27): Heim, Auswärts, Third
- Sonnenbrille ein/aus
- Chroma-Grün (`#00B140`) als Hintergrund für CapCut-Chroma-Key
- Einstellungen und Kalibrierung werden im Browser gespeichert

## Nutzung auf dem iPhone

1. Seite in Safari öffnen: `https://bilalschwert91.github.io/bilalabitv-vtuber/`
2. Optional: Teilen > „Zum Home-Bildschirm“. Dann läuft die App im Vollbild und die Kamera-Erlaubnis bleibt gespeichert.
3. „Kamera starten“ tippen, Kamerazugriff erlauben. Beim ersten Start kalibriert die App automatisch: 1–2 Sekunden gerade in die Kamera schauen.
4. Trikot, Sonnenbrille und Stimmung im Menü wählen.
5. „Aufnahme-Modus“ tippen. Menü und Kamera-Vorschau verschwinden.
6. Bildschirmaufnahme über das Kontrollzentrum starten. Das Aufnahme-Symbol lang drücken und das Mikrofon einschalten, sonst ist kein Ton auf der Aufnahme.
7. Sprechen. Stimmung während der Aufnahme über fünf unsichtbare Zonen am unteren Bildschirmrand wechseln (links nach rechts: Neutral, Glücklich, Enttäuscht, Sauer, Fraglich). Aktive Zone erneut tippen schaltet zurück auf Auto.
8. Doppeltipp am oberen Bildschirmrand führt zurück ins Menü.
9. Video in CapCut laden: Chroma-Key auf Grün, News-Bild als Hintergrund, Text „BilalAbiTV“, Untertitel.

## Stimmungs-Automatik

Wenn keine Zone aktiv ist, erkennt die App die Stimmung aus dem Gesicht: Lächeln = Glücklich, zusammengezogene Brauen = Sauer, innere Brauen hoch + Mundwinkel runter = Enttäuscht, eine Braue hoch = Fraglich.

## Entwicklung

Statische Dateien, kein Build-Schritt. Lokal testen:

```bash
npx -y serve -l 5173 .
```

Die Kamera funktioniert nur über HTTPS oder `localhost`.

## Dateien

- `index.html` – Oberfläche
- `css/style.css` – Layout
- `js/character.js` – SVG-Charakter, Trikots, Stimmungen
- `js/tracker.js` – MediaPipe-Tracking und Kalibrierung
- `js/app.js` – Steuerung, Glättung, Aufnahme-Modus

## Veröffentlichung (GitHub Pages)

Repository-Einstellungen > Pages > Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
