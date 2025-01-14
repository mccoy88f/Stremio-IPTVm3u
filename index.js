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

    // Preparazione del manifest
    const manifest = {
        id: config.manifest.id,
        version: config.manifest.version,
        name: config.manifest.name,
        description: config.manifest.description,
        logo: config.manifest.logo,
        resources: ['catalog', 'stream'],
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

    console.log('Manifest preparato:', JSON.stringify(manifest, null, 2));

    // Creiamo il builder
    const builder = new addonBuilder(manifest);

    // Verifica il manifest creato
    if (!builder || !builder.manifest) {
        console.error('Builder o manifest non valido dopo la creazione');
        console.log('Builder:', typeof builder, builder);
        console.log('Builder manifest:', builder?.manifest);
        throw new Error('Inizializzazione del builder fallita');
    }

    console.log('Manifest finale nel builder:', JSON.stringify(builder.manifest, null, 2));

    // Definisci gli handler
    builder.defineCatalogHandler(args => catalogHandler(args, builder));
    builder.defineStreamHandler(args => streamHandler(args, builder));

    return builder;
}

// Avvia il server
async function startServer() {
    try {
        const builder = await initializeAddon();
        
        if (!builder) {
            throw new Error('Builder non inizializzato correttamente');
        }

        // Verifica finale del builder prima di procedere
        if (!builder.manifest || !builder.manifest.catalogs) {
            console.error('Manifest non valido prima dell\'avvio del server');
            console.log('Manifest stato:', {
                hasManifest: !!builder.manifest,
                hasCatalogs: !!builder.manifest?.catalogs,
                catalogsLength: builder.manifest?.catalogs?.length
            });
            throw new Error('Manifest non valido');
        }

        // Aggiorna la cache all'avvio
        await updateCache(builder);
        console.log('Cache aggiornata con successo all\'avvio.');

        // Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
        if (config.enableEPG) {
            cron.schedule('0 3 * * *', () => {
                updateCache(builder);
            });
        }

        // Avvia il server HTTP
        const serverInterface = builder.getInterface();
        console.log('Interface generata:', serverInterface);
        
        serveHTTP(serverInterface, { port: config.port });
        console.log(`Server HTTP avviato sulla porta ${config.port}`);
    } catch (error) {
        console.error('Errore durante l\'avvio del server:', error);
        process.exit(1);
    }
}

// Avvia il server
startServer();
