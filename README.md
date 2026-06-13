# Quizpoker Multiplayer v05

Diese Version enthält:

- lokalen Testmodus wie v04
- Multiplayer-Lobby über Firebase/Firestore
- Raum erstellen / Raum beitreten
- Ersteller ist Spielleiter
- Live-Spielerliste
- Spielstart mit gemeinsamer Spielzustands-Synchronisierung

## Lokal testen

`index.html` per Doppelklick öffnen und **Lokales Spiel starten** wählen.

## Multiplayer aktivieren

1. Firebase-Projekt erstellen
2. Firestore Database aktivieren
3. Web-App in Firebase hinzufügen
4. Firebase-Konfiguration kopieren
5. In `js/firebase-config.js` einfügen
6. `firebaseEnabled: false` auf `firebaseEnabled: true` ändern
7. Ordner/Dateien auf GitHub Pages hochladen

## Firestore-Regeln für den ersten privaten Test

Für den ersten Test kannst du temporär diese Regeln verwenden:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /quizpoker_rooms/{roomId} {
      allow read, write: if true;
    }
  }
}
```

Wichtig: Diese Regeln sind nur für private Tests gedacht, nicht für eine öffentliche Veröffentlichung.

## Hinweis

Dies ist die erste Multiplayer-Basis. Die komplette Spiellogik wird bereits als gemeinsamer Spielzustand gespeichert. Im nächsten Schritt sollten die Rechte noch feiner getrennt werden: Spielleiter, aktiver Spieler, ausgewählte Antwortspieler.
