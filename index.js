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

    console.log('Opzioni dei generi create:', JSON.stringify(genreOptions, null, 2));

    // Crea il manifest completo
    const manifestConfig = {
        id: config.manifest.id,
        version: config.manifest.version,
        name: config.manifest.name,
        description: config.manifest.description,
        logo: config.manifest.logo,
        resources: config.manifest.resources,
        types: config.manifest.types,
        idPrefixes: config.manifest.idPrefixes,
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

    console.log('Creazione builder con manifest:', JSON.stringify(manifestConfig, null, 2));

    const builder = new addonBuilder(manifestConfig);

    // Verifica il builder e il manifest
    if (!builder || !builder.manifest) {
        console.error('Errore: Builder o manifest non inizializzati correttamente');
        console.log('Builder:', builder);
        return null;
    }

    console.log('Manifest inizializzato correttamente');
    console.log('Catalogs nel manifest:', JSON.stringify(builder.manifest.catalogs, null, 2));
    console.log('Generi nel manifest:', JSON.stringify(builder.manifest.catalogs[0].extra[0].options, null, 2));

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
    try {
        await updateCache(builder);
        console.log('Cache aggiornata con successo all\'avvio.');
    } catch (err) {
        console.error('Errore durante l\'aggiornamento della cache all\'avvio:', err);
    }

    // Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
    if (config.enableEPG) {
        cron.schedule('0 3 * * *', () => {
            updateCache(builder);
        });
    }

    // Avvia il server HTTP
    serveHTTP(builder.getInterface(), { port: config.port });
    console.log(`Server HTTP avviato sulla porta ${config.port}`);
}

// Avvia il server
startServer().catch(error => {
    console.error('Errore durante l\'avvio del server:', error);
    process.exit(1);
});
