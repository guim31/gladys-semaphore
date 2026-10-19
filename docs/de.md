# Semaphore UI

[Semaphore UI](https://semaphoreui.com/) ist eine freie Weboberfläche, um
Ansible-Playbooks, Terraform/OpenTofu-Code sowie Shell- oder Python-Skripte
auszuführen: Jede „Vorlage“ (Template) ist ein Auftrag, den du mit einem Klick
startest und dessen Ergebnis du verfolgst. Diese Integration bringt die
Vorlagen, **die du erlaubst**, in Gladys: Jede wird ein Gerät mit dem Status
ihrer letzten Aufgabe, eine Szene kann **eine Vorlage starten** (und auf ihr
Ende warten) oder ihre laufende Aufgabe **stoppen**, Szenen können reagieren,
wenn eine Aufgabe **erfolgreich ist** oder **fehlschlägt**, und ein
Dashboard-Widget zeigt ihren letzten Status mit einer Schaltfläche **Starten**.

Getestet mit einem echten Semaphore UI 2.19 (Docker, SQLite,
Ansible-Playbooks); noch nicht mit einer echten Gladys-Instanz: Rückmeldungen
sind willkommen in [den Issues](https://github.com/guim31/gladys-semaphore/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Semaphore UI 2.x, erreichbar vom Gladys-Rechner.
- Ein API-Token eines Semaphore-Benutzers, der die Vorlagen starten darf (Rolle
  „Task Runner“ oder höher in seinem Projekt).

Eine Vorlage zu starten führt Code auf deinen Rechnern aus. Deshalb lässt sich
aus Gladys nichts starten, solange du ihre Nummer nicht in die Liste der
erlaubten Vorlagen eingetragen hast, und deshalb liest die Integration nie die
Ausgabe der Aufgaben (Ansible-Protokolle können Geheimnisse enthalten): nur
ihren Status und ihre Dauer.

Bei jeder Aktualisierung (standardmäßig jede Minute) liest die Integration die
Liste der Projekte und dann die Vorlagen der Projekte, die eine erlaubte
Vorlage enthalten; alle 5 Sekunden, solange eine Aufgabe einer erlaubten
Vorlage läuft. Semaphore begrenzt die Anfragen an seine API nicht.

## Erste Schritte

### 1. Ein API-Token erstellen

Öffne in Semaphore das Benutzermenü (unten links) → **API tokens** und
erstelle ein Token. In einer Version ohne diesen Bildschirm erstellt die API
eines: `POST /api/user/tokens`, wenn du angemeldet bist. Das Token handelt mit
den Rechten seines Benutzers: Ein eigener Benutzer, der nur Mitglied der
betroffenen Projekte ist, begrenzt, was Gladys tun kann.

### 2. Die Integration konfigurieren

In Gladys, **Integrationen → Semaphore UI → Konfiguration**:

- **Semaphore-Adresse**: die Adresse, mit der du Semaphore öffnest, z. B.
  `http://192.168.1.2:3000` (zu einer reinen IP-Adresse wird Port 3000
  ergänzt).
- **API-Token**: das Token aus Schritt 1.
- **Sprache der Namen**: standardmäßig Französisch; sie legt die
  Funktionsnamen beim Hinzufügen eines Geräts, die Status und die
  Szenenergebnisse fest.

Speichere und klicke dann auf **Verbindung testen**: Die Liste zeigt alle Vorlagen,
die das Token sieht, mit Nummer, Projekt und Name, z. B.
`#3 Home lab: Update servers`.

### 3. Vorlagen erlauben

Trage in **Erlaubte Vorlagen (Nummern)** die Nummern der Vorlagen ein, die
Gladys verfolgen und starten darf, durch Kommas getrennt: `3, 7`. Die Nummer
steht auch in der Adresse einer Vorlage in Semaphore
(`…/project/1/templates/3`). Leer: Nichts wird verfolgt, nichts lässt sich
starten.

### 4. Die Geräte hinzufügen

Füge im Tab **Entdecken** die gewünschten Vorlagen als Geräte hinzu. Auslöser,
Aktionen und Widget funktionieren für jede erlaubte Vorlage; die Geräte bringen
die Zustände und den Verlauf.

## Die Geräte

Ein Gerät pro erlaubter Vorlage, mit ihrem Namen:

| Funktion                   | Bedeutung                                                                         |
| -------------------------- | --------------------------------------------------------------------------------- |
| Letzte Aufgabe             | Status der letzten Aufgabe: Erfolgreich, Fehlgeschlagen, Läuft, Gestoppt, Wartet… |
| Letzte Aufgabe erfolgreich | 1, wenn die letzte beendete Aufgabe erfolgreich war, 0 bei Fehler oder Stopp      |
| Läuft                      | 1, solange eine Aufgabe der Vorlage läuft                                         |
| Letzter Start              | Start der letzten Aufgabe (Tag/Monat Stunden:Minuten, Zeitzone von Gladys)        |
| Dauer der letzten Aufgabe  | Dauer der letzten beendeten Aufgabe, in Sekunden                                  |

Das Gerät hat keinen Befehl: Ansible zu starten ist kein Schalter, den ein
Sprachassistent oder ein versehentliches Tippen erreichen sollte. Eine Vorlage
wird aus einer Szene oder aus dem Widget gestartet, das um Bestätigung bittet.

## Dashboard

Das Widget **Semaphore-Vorlagen** listet die erlaubten Vorlagen (oder die in
seinen Einstellungen gewählten), zuerst die fehlgeschlagenen, dann die
laufenden: letzter Status, Startzeit, Dauer. Unter der Liste eine Schaltfläche
pro Vorlage (die ersten drei): **Starten**, oder **Stoppen**, solange eine
Aufgabe läuft. Gladys bittet vor dem Senden um Bestätigung. **Aktualisieren**
liest Semaphore neu.

## Szenen

### Auslöser

- **Eine Semaphore-Aufgabe ist erfolgreich**: Eine Aufgabe einer erlaubten
  Vorlage endet erfolgreich.
- **Eine Semaphore-Aufgabe schlägt fehl**: Eine Aufgabe einer erlaubten
  Vorlage endet mit einem Fehler.

Beide lassen sich auf bestimmte Vorlagen beschränken und liefern den Namen der
Vorlage, das Projekt, die Nummer der Aufgabe und die Dauer in Sekunden. Eine
gestoppte Aufgabe ist weder das eine noch das andere. Aufgaben, die in
Semaphore selbst, durch einen Zeitplan oder ein anderes Werkzeug gestartet
wurden, zählen auch. Die erste Abfrage nach der Installation meldet nichts aus
der Vergangenheit; eine Aufgabe, die während eines Neustarts von Gladys oder
der Integration endete, wird einmal gemeldet.

### Aktionen

- **Semaphore-Vorlage starten**: startet eine erlaubte Vorlage. **Zusätzliche
  Variablen (JSON)** ist optional: ein JSON-Objekt, das der Aufgabe übergeben
  wird, z. B. `{"target": "web1"}` (Werte der Szene können eingefügt werden).
  Mit **Auf das Ende warten (höchstens 90 s)** wartet die Szene auf die
  Aufgabe, und die nächsten Aktionen erhalten ihr Ergebnis. Ausgaben: Nummer
  der Aufgabe, beendet, erfolgreich, Status, Dauer (s).
- **Semaphore-Aufgabe stoppen**: stoppt die laufende Aufgabe einer erlaubten
  Vorlage. Ausgaben: eine Aufgabe wurde gestoppt (ja/nein), Nummer der
  Aufgabe.

Beide lehnen eine Vorlage ab, die nicht in der Liste der erlaubten Vorlagen
steht, auch wenn ihr Gerät in Gladys noch existiert.

### Szenen-Ideen

- Jeden Sonntag um 3 Uhr „Update servers“ starten; bei **Eine
  Semaphore-Aufgabe schlägt fehl** eine Telegram-Nachricht senden:
  „{{triggerEvent.data.template}} ist nach {{triggerEvent.data.duration}} s
  fehlgeschlagen“.
- Beim Verlassen des Hauses „Nightly backup“ mit **Auf das Ende warten**
  starten und dich nur benachrichtigen, wenn „Erfolgreich“ falsch ist.
- Eine Schaltfläche auf dem Wandtablet: das Widget, mit „Medienserver neu
  starten“ erlaubt.

## Fehlerbehebung

- **API-Token abgelehnt**: Das Token wurde gelöscht oder falsch kopiert;
  erstelle ein neues.
- **Von Semaphore abgelehnt: Dieser Benutzer darf im Projekt keine Aufgaben
  starten**: Gib dem Benutzer des Tokens die Rolle „Task Runner“ (oder höher)
  im Projekt.
- **Erlaubt, aber nicht gefunden**: Die Nummer ist falsch, die Vorlage wurde
  gelöscht, oder der Benutzer des Tokens ist kein Mitglied ihres Projekts.
  **Verbindung testen** listet, was das Token sieht.
- **Keine Semaphore-API unter dieser Adresse**: Prüfe Adresse und Port; hinter
  einem Reverse-Proxy den Pfad mit angeben.
- **Die Adresse leitet um**: Gib die `https://`-Adresse ein.
- Eine Aufgabe erscheint nicht sofort: Die Integration liest Semaphore jede
  Minute (einstellbar), alle 5 Sekunden, solange eine Aufgabe läuft.

## Grenzen

- Nur die letzte Aufgabe jeder Vorlage wird gelesen: Enden zwei Aufgaben
  derselben Vorlage zwischen zwei Abfragen, löst nur die letzte aus.
- Die Ausgabe der Aufgaben wird absichtlich nie gelesen oder angezeigt.
- „Auf das Ende warten“ wartet höchstens 90 s (die Grenze einer Szenenaktion
  in Gladys); eine längere Aufgabe läuft weiter, und die Auslöser melden ihr
  Ende.
- Terraform-Aufgaben, die auf eine Bestätigung warten, zeigen „Zu bestätigen“;
  bestätigt wird in Semaphore.
- Entwickelt und getestet mit Semaphore UI 2.19.17; ältere 2.x-Versionen
  sollten funktionieren (gleiche API), ungetestet.
