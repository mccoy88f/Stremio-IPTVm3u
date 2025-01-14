const { parsePlaylist, parseEPG } = require('./parser');
const config = require('./config');

// Cache per i dati
let cachedData = {
    m3u: null,
    epg: null,
    lastUpdated: null,
    genres: []
};

// Funzione per aggiornare la cache
async function updateCache(builder) {
    try {
        console.log('Aggiornamento della cache in corso...');

        // Parsa la playlist M3U
        const { items, groups } = await parsePlaylist(config.M3U_URL);
        console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
        console.log('Generi trovati:', groups);

        // Verifica che builder e manifest siano definiti correttamente
        if (builder?.manifest?.catalogs?.[0]?.extra?.[0]) {
            const genreOptions = groups.map(genre => ({
                name: String(genre),
                value: String(genre)
            }));
            
            // Aggiorna le opzioni dei generi nel manifest
            builder.manifest.catalogs[0].extra[0].options = genreOptions;
            
            console.log('Generi aggiornati nel manifest:', JSON.stringify(genreOptions));
        } else {
            console.error('Errore: Manifest non accessibile per aggiornamento generi');
            console.log('Builder state:', {
                hasBuilder: !!builder,
                hasManifest: !!builder?.manifest,
                hasCatalogs: !!builder?.manifest?.catalogs,
                catalogsLength: builder?.manifest?.catalogs?.length
            });
        }

        // Gestisci l'EPG se abilitato
        let epgData = null;
        if (config.enableEPG) {
            console.log('EPG abilitato. Scaricamento in corso...');
            try {
                epgData = await parseEPG(config.EPG_URL);
                console.log('EPG caricato correttamente.');
            } catch (epgError) {
                console.error('Errore nel caricamento dell\'EPG:', epgError);
                if (cachedData.epg) {
                    epgData = cachedData.epg;
                    console.log('Utilizzo della cache EPG precedente.');
                }
            }
        } else {
            console.log('EPG disabilitato. Saltato il caricamento.');
        }

        // Aggiorna la cache
        cachedData = {
            m3u: items,
            epg: epgData,
            lastUpdated: Date.now(),
            genres: groups
        };

        console.log('Cache aggiornata con successo!');
    } catch (error) {
        console.error('Errore nell\'aggiornamento della cache:', error);
        throw error;
    }
}

function getCachedData() {
    return cachedData;
}

module.exports = {
    updateCache,
    getCachedData
};
