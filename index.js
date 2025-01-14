const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cron = require('node-cron');
const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const { catalogHandler, streamHandler } = require('./handlers');

async function createManifest() {
    // Assicurati che la cache sia inizializzata
    await CacheManager.updateCache(true);
    const { genres } = CacheManager.getCachedData();
    
    // Crea le opzioni dei generi
    const genreOptions = genres.map(genre => ({
        name: String(genre),
        value: String(genre)
    }));

    // Crea il manifest completo
    return {
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
}

async function startServer() {
    try {
        // Crea il manifest e il builder
        const manifest = await createManifest();
        console.log('Manifest creato:', JSON.stringify(manifest, null, 2));
        
        const builder = new addonBuilder(manifest);

        // Definisci gli handler
        builder.defineCatalogHandler(catalogHandler);
        builder.defineStreamHandler(streamHandler);

        // Configura gli aggiornamenti periodici
        CacheManager.on('cacheUpdated', () => {
            console.log('Cache aggiornata con successo');
        });

        CacheManager.on('cacheError', (error) => {
            console.error('Errore nell\'aggiornamento della cache:', error);
        });

        // Configura il cron job per l'aggiornamento
        if (config.enableEPG) {
            cron.schedule('0 */12 * * *', async () => {
                try {
                    await CacheManager.updateCache(true);
                    await EPGManager.parseEPG(config.EPG_URL);
                } catch (error) {
                    console.error('Errore nell\'aggiornamento periodico:', error);
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
