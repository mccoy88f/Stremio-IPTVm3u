# Stremio IPTV Add-on

Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.

## Funzionalità
- Carica una playlist M3U da un URL configurabile.
- Utilizza l'EPG per aggiungere icone, descrizioni e programmi in onda.
- Ricerca dei canali.
- Aggiornamento automatico della cache ogni giorno alle 3 di mattina.
- Pagina HTML per aggiungere l'add-on a Stremio con un solo clic.

## Configurazione
1. Imposta la variabile d'ambiente `M3U_URL` con l'URL della playlist M3U.
2. Avvia l'add-on con `npm start`.

## Deploy su Render.com
1. Collega il repository GitHub a Render.com.
2. Configura la variabile d'ambiente `M3U_URL`.
3. Avvia il deploy.

## Aggiungi l'add-on a Stremio
Puoi aggiungere l'add-on a Stremio in due modi:

### Metodo 1: Tramite la pagina HTML
1. Vai alla homepage del tuo server (ad esempio, `https://<your-render-url>.onrender.com`).
2. Clicca sul pulsante **"Aggiungi a Stremio"**.
3. Stremio aprirà automaticamente l'add-on e ti chiederà di installarlo.

### Metodo 2: Manualmente
1. Vai su "Addons" > "Addon Repository" > "Install from URL".
2. Inserisci l'URL del manifest (ad esempio, `https://<your-render-url>.onrender.com/manifest.json`).

## Struttura del progetto
- `index.js`: Il server principale che gestisce la logica dell'add-on e serve la pagina HTML.
- `index.html`: La pagina HTML che permette di aggiungere l'add-on a Stremio con un clic.
- `package.json`: File di configurazione delle dipendenze e degli script.
- `README.md`: Questa guida.

## Dipendenze
- `stremio-addon-sdk`: SDK per creare add-on per Stremio.
- `axios`: Per effettuare richieste HTTP.
- `m3u8-parser`: Per analizzare la playlist M3U.
- `xml2js`: Per analizzare l'EPG in formato XML.
- `node-cron`: Per aggiornare la cache automaticamente.
- `express`: Per creare il server web.
- `path`: Per gestire i percorsi dei file.

## Come contribuire
Se vuoi contribuire al progetto, segui questi passaggi:
1. Fai un fork del repository.
2. Crea un nuovo branch per la tua feature (`git checkout -b feature/nuova-feature`).
3. Fai commit delle tue modifiche (`git commit -m 'Aggiunta nuova feature'`).
4. Pusha il branch (`git push origin feature/nuova-feature`).
5. Apri una Pull Request.

## Licenza
Questo progetto è rilasciato sotto la licenza MIT. Consulta il file `LICENSE` per ulteriori dettagli.
