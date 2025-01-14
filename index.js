const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cron = require('node-cron');
const { parsePlaylist } = require('./parser');
const { updateCache, getCachedData } = require('./cache');
const { catalogHandler, streamHandler } = require('./handlers');
const config = require('./config');

// Inizializza il manifest con i generi dalla playlist
async function initializeAddon() {
    try {
        // Estrai i generi dalla playlist e aggiorna la cache
        await updateCache();
        const { genres } = getCachedData();
        
        console.log('Generi estratti inizialmente:', genres);

        // Crea le opzioni dei generi
        const genreOptions = genres.map(genre => {
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
        builder.defineCatalogHandler(args => catalogHandler(args));
        builder.defineStreamHandler(args => streamHandler(args));

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

        // Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
        if (config.enableEPG) {
            cron.schedule('0 3 * * *', () => {
                updateCache().catch(error => {
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
