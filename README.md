# BilalAbiTV VTuber

Web-basierter 2D-VTuber-Avatar für TikTok-Videos. Läuft komplett im Safari-Browser auf dem iPhone, kein PC und keine App nötig. Das Gesicht wird per Frontkamera mit MediaPipe Face Landmarker getrackt und auf einen gezeichneten Charakter übertragen.

Der Charakter besteht aus neun Bildern in `img/` (mit Gemini erzeugt): neutral, Mund offen, Augen zu, vier Stimmungen und zwei weitere Trikots. Die App schneidet daraus Kopf, Mund und Augen aus, entfernt den grünen Hintergrund und blendet die Ebenen pro Frame auf einem Canvas zusammen.

## Funktionen

- Mund auf/zu, Blinzeln, Kopf neigen/drehen/nicken, Idle-Atmen
- Fünf Stimmungen: Neutral, Glücklich, Enttäuscht, Sauer, Fraglich
- Drei Trikots (Saison 2026/27): Heim, Auswärts, Third
- Sonnenbrille ein/aus
- Aufnahme direkt in der App: Charakter + Mikrofon als MP4, „Video sichern“ legt es in Fotos ab
- Chroma-Grün (`#00B140`) als Hintergrund für CapCut-Chroma-Key
- Einstellungen und Kalibrierung werden im Browser gespeichert

## Nutzung auf dem iPhone

1. Seite in Safari öffnen: `https://bilalschwert91.github.io/bilalabitv-vtuber/`
2. Optional: Teilen > „Zum Home-Bildschirm“. Dann läuft die App im Vollbild und die Kamera-Erlaubnis bleibt gespeichert.
3. „Kamera starten“ tippen, Kamerazugriff erlauben. Beim ersten Start kalibriert die App automatisch: 1–2 Sekunden gerade in die Kamera schauen.
4. Trikot, Sonnenbrille und Stimmung im Menü wählen.
5. „Aufnahme-Modus“ tippen. Menü und Kamera-Vorschau verschwinden.
6. Roten Knopf rechts tippen. Beim ersten Mal Mikrofon erlauben. Der Zähler läuft.
7. Sprechen. Stimmung über die fünf Zonen am unteren Bildschirmrand wechseln (Neutral, Glücklich, Enttäuscht, Sauer, Fraglich). Aktive Zone erneut tippen schaltet zurück auf Auto. Knöpfe und Zonen sind nicht im Video, aufgenommen wird nur der Charakter.
8. Roten Knopf erneut tippen. Im Teilen-Menü „Video sichern“ wählen, das MP4 liegt dann in Fotos.
9. Doppeltipp am oberen Bildschirmrand führt zurück ins Menü.
10. Video in CapCut laden: Chroma-Key auf Grün, News-Bild als Hintergrund, Text „BilalAbiTV“, Untertitel.

Alternative ohne App-Aufnahme: Bildschirmaufnahme über das Kontrollzentrum, Mikrofon einschalten (Symbol lang drücken). Dann sind Knöpfe und Zonen aber mit im Video.

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
- `js/character.js` – Canvas-Charakter aus den Bildern in `img/`, Trikots, Stimmungen, Sonnenbrille
- `img/` – Charakter-Bilder: Kopf-Varianten (768x1376) und Trikots mit Armen (`*_body.jpg`, beliebige Auflösung, werden am Kopf ausgerichtet)
- `js/tracker.js` – MediaPipe-Tracking und Kalibrierung
- `js/app.js` – Steuerung, Glättung, Aufnahme-Modus
- `js/recorder.js` – MediaRecorder: Canvas + Mikrofon zu MP4, Speichern über Teilen-Menü

## Veröffentlichung (GitHub Pages)

Repository-Einstellungen > Pages > Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
