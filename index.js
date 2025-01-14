const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cron = require('node-cron');
const { parsePlaylist } = require('./parser');
const { updateCache } = require('./cache');
const { catalogHandler, streamHandler } = require('./handlers');
const config = require('./config');

// Inizializza il manifest con i generi dalla playlist
async function initializeAddon() {
    try {
        // Estrai i generi dalla playlist
        const { groups: extractedGroups } = await parsePlaylist(config.M3U_URL);
        const groups = Array.from(extractedGroups);
        console.log('Generi estratti inizialmente:', groups);

        // Crea le opzioni dei generi
        const genreOptions = groups.map(genre => {
            console.log('Creazione opzione per genere:', genre);
            return {
                name: String(genre),
                value: String(genre)
            };
        });

        console.log('Opzioni dei generi create:', JSON.stringify(genreOptions, null, 2));

        // Crea il manifest
        const manifest = {
            ...config.manifest,
            catalogs: [{
                type: 'tv',
                id: 'iptvitalia',
                name: 'Canali TV Italia',
                extra: [{
                    name: 'genre',
                    isRequired: false,
                    options: genreOptions
                }, {
                    name: 'search',
                    isRequired: false
                }]
            }]
        };

        console.log('Manifest preparato:', JSON.stringify(manifest, null, 2));

        // Crea il builder con il manifest
        const builder = new addonBuilder(manifest);

        // Definisci gli handler
        builder.defineCatalogHandler(args => catalogHandler(args, builder));
        builder.defineStreamHandler(args => streamHandler(args, builder));

        return builder;
    } catch (error) {
        console.error('Errore durante l\'inizializzazione dell\'addon:', error);
        throw error;
    }
}

// Avvia il server
async function startServer() {
    try {
        const builder = await initializeAddon();
        
        // Aggiorna la cache all'avvio
        await updateCache(builder);
        console.log('Cache aggiornata con successo all\'avvio.');

        // Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
        if (config.enableEPG) {
            cron.schedule('0 3 * * *', () => {
                updateCache(builder).catch(error => {
                    console.error('Errore nell\'aggiornamento della cache:', error);
                });
            });
        }

        // Avvia il server HTTP
        const serverInterface = builder.getInterface();
        serveHTTP(serverInterface, { port: config.port });
        console.log(`Server HTTP avviato sulla porta ${config.port}`);
    } catch (error) {
        console.error('Errore durante l\'avvio del server:', error);
        process.exit(1);
    }
}

// Avvia il server
startServer();
