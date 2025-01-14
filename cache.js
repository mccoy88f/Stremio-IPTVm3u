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
async function updateCache() {
    try {
        console.log('Aggiornamento della cache in corso...');

        // Parsa la playlist M3U
        const { items, groups } = await parsePlaylist(config.M3U_URL);
        console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
        console.log('Generi trovati:', groups);

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
