const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cron = require('node-cron');
const { updateCache, getCachedData } = require('./cache');
const { catalogHandler, streamHandler } = require('./handlers');
const config = require('./config');

async function createManifest() {
    // Aggiorna la cache per avere i generi aggiornati
    await updateCache();
    const { genres } = getCachedData();
    
    // Crea le opzioni dei generi
    const genreOptions = genres.map(genre => ({
        name: String(genre),
        value: String(genre)
    }));

    // Crea il manifest completo
    return {
        id: config.manifest.id,
        version: config.manifest.version,
        name: config.manifest.name,
        description: config.manifest.description,
        logo: config.manifest.logo,
        background: config.manifest.logo,
        behaviorHints: {
            adult: false,
            p2p: false
        },
        resources: ['stream', 'catalog'],
        types: ['tv'],
        idPrefixes: ['tv'],
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
}

async function startServer() {
    try {
        // Crea il manifest e il builder
        const manifest = await createManifest();
        const builder = new addonBuilder(manifest);

        // Definisci gli handler
        builder.defineCatalogHandler(catalogHandler);
        builder.defineStreamHandler(streamHandler);

        // Configura l'aggiornamento periodico della cache
        if (config.enableEPG) {
            cron.schedule('0 3 * * *', async () => {
                try {
                    await updateCache();
                    console.log('Cache aggiornata con successo');
                } catch (error) {
                    console.error('Errore nell\'aggiornamento della cache:', error);
                }
            });
        }

        // Avvia il server HTTP
        const serverInterface = builder.getInterface();
        serveHTTP(serverInterface, { port: config.port });
        console.log(`Server HTTP avviato sulla porta ${config.port}`);
        console.log(`Addon accessibile all'indirizzo: http://127.0.0.1:${config.port}/manifest.json`);
    } catch (error) {
        console.error('Errore durante l\'avvio del server:', error);
        process.exit(1);
    }
}

// Avvia il server
startServer();
