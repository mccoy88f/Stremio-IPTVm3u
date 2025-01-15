const { addonBuilder } = require('stremio-addon-sdk');
const PlaylistTransformer = require('./playlist-transformer');
const { catalogHandler, streamHandler } = require('./handlers');
const metaHandler = require('./meta-handler');
const EPGManager = require('./epg-manager');

async function generateConfig() {
    try {
        console.log('\n=== Generazione Configurazione Iniziale ===');
        
        // Crea un'istanza del transformer
        const transformer = new PlaylistTransformer();
        
        // Carica e trasforma la playlist
        const playlistUrl = process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u';
        console.log('Caricamento playlist da:', playlistUrl);
        
        const data = await transformer.loadAndTransform(playlistUrl);
        console.log(`Trovati ${data.genres.length} generi`);

        // Gestione EPG URL - usa l'URL dalla playlist se non è specificato nelle variabili d'ambiente
        const epgUrl = process.env.EPG_URL || data.epgUrl || 'https://www.epgitalia.tv/gzip';
        console.log('EPG URL configurato:', epgUrl);

        // Crea la configurazione base
        const config = {
            port: process.env.PORT || 10000,
            M3U_URL: playlistUrl,
            EPG_URL: epgUrl,
            enableEPG: process.env.ENABLE_EPG === 'yes',
            PROXY_URL: process.env.PROXY_URL || null,
            PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
            FORCE_PROXY: process.env.FORCE_PROXY === 'yes',
            
            cacheSettings: {
                updateInterval: 12 * 60 * 60 * 1000,
                maxAge: 24 * 60 * 60 * 1000,
                retryAttempts: 3,
                retryDelay: 5000
            },
            
            epgSettings: {
                maxProgramsPerChannel: 50,
                updateInterval: 24 * 60 * 60 * 1000, // Aggiornamento ogni 24 ore
                cacheExpiry: 24 * 60 * 60 * 1000
            },
            
            manifest: {
                id: 'org.mccoy88f.iptvaddon',
                version: '1.3.0',
                name: 'IPTV Italia Addon',
                description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
                logo: 'https://github.com/mccoy88f/Stremio-IPTVm3u/blob/main/tv.png?raw=true',
                resources: ['stream', 'catalog', 'meta'],
                types: ['tv'],
                idPrefixes: ['tv'],
                catalogs: [
                    {
                        type: 'tv',
                        id: 'iptv_category',
                        name: 'IPTV Italia',
                        extra: [
                            {
                                name: 'genre',
                                isRequired: false,
                                options: data.genres
                            },
                            {
                                name: 'search',
                                isRequired: false
                            },
                            {
                                name: 'skip',
                                isRequired: false
                            }
                        ]
                    }
                ]
            }
        };

        console.log('Configurazione generata con i seguenti generi:');
        console.log(data.genres.join(', '));
        if (config.enableEPG) {
            console.log('EPG abilitata, URL:', config.EPG_URL);
        } else {
            console.log('EPG disabilitata');
        }
        console.log('\n=== Fine Generazione Configurazione ===\n');

        return config;
    } catch (error) {
        console.error('Errore durante la generazione della configurazione:', error);
        throw error;
    }
}

async function startAddon() {
    try {
        // Genera la configurazione dinamicamente
        const config = await generateConfig();

        // Create the addon
        const builder = new addonBuilder(config.manifest);

        // Define routes
        builder.defineStreamHandler(streamHandler);
        builder.defineCatalogHandler(catalogHandler);
        builder.defineMetaHandler(metaHandler);

        // Initialize the cache manager
        const CacheManager = require('./cache-manager')(config);

        // Update cache on startup
        await CacheManager.updateCache(true).catch(error => {
            console.error('Error updating cache on startup:', error);
        });

        // Personalizza la pagina HTML
        const landingTemplate = landing => `
<!DOCTYPE html>
<html style="background: #000">
<head>
    <meta charset="utf-8">
    <title>${landing.name} - Stremio Addon</title>
    <style>
        body {
            background: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 { color: #fff; }
        .logo {
            width: 150px;
            margin: 0 auto;
            display: block;
        }
        button {
            border: 0;
            outline: 0;
            color: #fff;
            background: #8A5AAB;
            padding: 13px 30px;
            margin: 20px 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            border-radius: 5px;
        }
        button:hover {
            background: #9B6BC3;
        }
        .footer {
            margin-top: 50px;
            font-size: 14px;
            color: #666;
        }
        .footer a {
            color: #8A5AAB;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
    <script>
        function copyManifestLink() {
            const manifestUrl = window.location.href + 'manifest.json';
            navigator.clipboard.writeText(manifestUrl).then(() => {
                alert('Link del manifest copiato negli appunti!');
            });
        }
    </script>
</head>
<body>
    <img class="logo" src="${landing.logo}" />
    <h1 style="color: white">${landing.name}</h1>
    <h2 style="color: white">${landing.description}</h2>
    <button onclick="window.location = 'stremio://${landing.transportUrl}/manifest.json'">
        Aggiungi a Stremio
    </button>
    <button onclick="copyManifestLink()">
        Copia link manifest
    </button>
    <div class="footer">
        Questo server è basato sul progetto di McCoy88f<br>
        <a href="https://github.com/mccoy88f/Stremio-IPTVm3u/" target="_blank">Link al repository</a>
    </div>
</body>
</html>`;

        // Create and start the server
        const addonInterface = builder.getInterface();
        const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

        // Avvia prima il server
        await serveHTTP(addonInterface, { port: config.port, landingTemplate });
        
        console.log('Addon attivo su:', `http://localhost:${config.port}`);
        console.log('Aggiungi il seguente URL a Stremio:', `http://localhost:${config.port}/manifest.json`);

        // Inizializza l'EPG dopo l'avvio del server se è abilitata
        if (config.enableEPG) {
            console.log('Inizializzazione EPG pianificata tra 5 minuti...');
            await EPGManager.initializeEPG(config.EPG_URL);
        } else {
            console.log('EPG disabilitata, skip inizializzazione');
        }

    } catch (error) {
        console.error('Failed to start addon:', error);
        process.exit(1);
    }
}

// Start the addon
startAddon();
