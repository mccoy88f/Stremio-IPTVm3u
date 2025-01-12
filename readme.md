# Stremio IPTV Add-on

Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.

## Funzionalità
- Carica una playlist M3U da un URL configurabile.
- Utilizza l'EPG per aggiungere icone, descrizioni e programmi in onda.
- Ricerca dei canali.
- Aggiornamento automatico della cache ogni giorno alle 3 di mattina.

## Configurazione
1. Imposta la variabile d'ambiente `M3U_URL` con l'URL della playlist M3U.
2. Avvia l'add-on con `npm start`.

## Deploy su Render.com
1. Collega il repository GitHub a Render.com.
2. Configura la variabile d'ambiente `M3U_URL`.
3. Avvia il deploy.

## Aggiungi l'add-on a Stremio
1. Vai su "Addons" > "Addon Repository" > "Install from URL".
2. Inserisci l'URL del manifest (ad esempio, `http://localhost:7000/manifest.json`).
