# Stremio IPTV Add-on

Un add-on per Stremio che carica una playlist M3U di IPTV Italia con supporto EPG opzionale.

## Funzionalità
- Carica una playlist M3U da un URL configurabile
- Supporto EPG opzionale per aggiungere informazioni sui programmi (disabilitato di default)
- Ricerca dei canali
- Aggiornamento automatico della cache ogni giorno alle 3 di mattina (solo se l'EPG è abilitato)
- Interfaccia web per aggiungere l'add-on a Stremio con un solo clic

## Configurazione
L'addon utilizza le seguenti variabili d'ambiente:

### M3U_URL
- Variabile opzionale
- URL della playlist M3U
- Se non specificata, viene utilizzata la playlist predefinita di TUNDRAK dalla pagina https://github.com/Tundrak/IPTV-Italia: `https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u`

### ENABLE_EPG
- Variabile opzionale
- Controlla se l'EPG è abilitato
- Valori possibili:
  - `yes`: abilita l'EPG
  - non impostata o qualsiasi altro valore: EPG disabilitato
- Se abilitato, utilizza l'EPG da: `https://www.epgitalia.tv/gzip`
- **IMPORTANTE**: Si consiglia di mantenere l'EPG disabilitato se si fa il deploy su Render con il piano gratuito a causa delle limitazioni di risorse

## Deploy Locale
1. Clona il repository
2. Installa le dipendenze con `npm install`
3. (Opzionale) Imposta la variabile d'ambiente `M3U_URL` se vuoi usare una playlist personalizzata
4. (Opzionale) Imposta `ENABLE_EPG=yes` se vuoi abilitare l'EPG
5. Avvia l'add-on con `npm start`

## Deploy su Render.com
1. Collega il repository GitHub a Render.com
2. Configura il servizio:
   - **Environment Variables**:
     - `M3U_URL`: (opzionale) URL della tua playlist personalizzata
     - **NON** abilitare l'EPG (`ENABLE_EPG`) sul piano gratuito di Render
3. Avvia il deploy

## Aggiungi l'add-on a Stremio

### Metodo 1: Tramite la pagina web
1. Apri la homepage del server (es. `http://localhost:10000` per installazioni locali)
2. Clicca sul pulsante "Aggiungi a Stremio"

### Metodo 2: Manualmente
1. Apri Stremio
2. Vai su "Addons" > "Community Addons"
3. Incolla l'URL del manifest (es. `http://localhost:10000/manifest.json` per installazioni locali)

## Struttura del Progetto
- `index.js`: Server principale che gestisce la logica dell'add-on
- `index.html`: Pagina web per l'installazione dell'add-on
- `package.json`: Configurazione del progetto e dipendenze
- `README.md`: Questa documentazione

## Come Contribuire
1. Fai un fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/NuovaFeature`)
3. Fai commit delle modifiche (`git commit -am 'Aggiunta nuova feature'`)
4. Pusha il branch (`git push origin feature/NuovaFeature`)
5. Apri una Pull Request

## Licenza
Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.
L'icona appartiene a Iconic Panda utilizzata senza fini commerciali con attribuzione: https://www.flaticon.com/free-icon/tv_18223703?term=tv&page=1&position=2&origin=tag&related_id=18223703
