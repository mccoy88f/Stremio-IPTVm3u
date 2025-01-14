const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cron = require('node-cron');
const { parsePlaylist } = require('./parser');
const { updateCache } = require('./cache');
const { catalogHandler, streamHandler } = require('./handlers');
const config = require('./config');

// Inizializza il manifest con i generi dalla playlist
async function initializeAddon() {
    let groups = [];
    try {
        const { groups: extractedGroups } = await parsePlaylist(config.M3U_URL);
        groups = Array.from(extractedGroups);
        console.log('Generi estratti inizialmente:', groups);
    } catch (error) {
        console.error('Errore nel caricamento della playlist M3U:', error);
        groups = [];
    }

    const genreOptions = groups.map(genre => {
        console.log('Creazione opzione per genere:', genre);
        return {
            name: String(genre),
            value: String(genre)
        };
    });

    console.log('Opzioni dei generi create:', genreOptions);

    const builder = new addonBuilder({
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
    });

    if (!builder.manifest) {
        console.error('Builder manifest non inizializzato');
        return null;
    }

    // Debug: Verifica il manifest
    if (!builder.manifest.catalogs || !builder.manifest.catalogs.length) {
        console.error('Errore: Manifest non inizializzato correttamente');
        console.log('Builder:', builder);
        console.log('Manifest:', builder.manifest);
    } else {
        console.log('Manifest inizializzato correttamente');
        console.log('Generi nel manifest:', JSON.stringify(builder.manifest.catalogs[0].extra[0].options));
    }

    // Definisci gli handler
    builder.defineCatalogHandler(args => catalogHandler(args, builder));
    builder.defineStreamHandler(args => streamHandler(args, builder));

    return builder;
}

// Avvia il server
async function startServer() {
    const builder = await initializeAddon();
    
    if (!builder) {
        console.error('Errore: Builder non inizializzato correttamente');
        process.exit(1);
    }

    // Aggiorna la cache all'avvio
    updateCache(builder).then(() => {
        console.log('Cache aggiornata con successo all\'avvio.');
    }).catch((err) => {
        console.error('Errore durante l\'aggiornamento della cache all\'avvio:', err);
    });

    // Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
    if (config.enableEPG) {
        cron.schedule('0 3 * * *', () => {
            updateCache(builder);
        });
    }

    // Avvia il server HTTP
    serveHTTP(builder.getInterface(), { port: config.port });
}

// Avvia il server
startServer();
