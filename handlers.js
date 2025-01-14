const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

/**
 * Arricchisce i metadati del canale con informazioni EPG se disponibili
 */
function enrichWithEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const epgData = EPGManager.getCurrentProgram(channelId);
    const upcoming = EPGManager.getUpcomingPrograms(channelId, 3);

    if (epgData) {
        meta.description = `${meta.description}\n\nIn onda: ${epgData.title}`;
        if (epgData.description) {
            meta.description += `\n${epgData.description}`;
        }

        if (upcoming && upcoming.length > 0) {
            meta.description += '\n\nProssimi programmi:\n' + upcoming
                .map(p => `- ${p.title} (${p.start.toLocaleTimeString()})`)
                .join('\n');
        }

        meta.releaseInfo = `In onda: ${epgData.title}`;
    }

    return meta;
}

async function catalogHandler({ type, id, extra }) {
    try {
        console.log('Catalog richiesto con args:', JSON.stringify({ type, id, extra }, null, 2));
        
        // Aggiorna la cache se necessario
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        const { search, genre, skip = 0 } = extra || {};
        const ITEMS_PER_PAGE = 100;

        // Log dei generi disponibili per debug
        console.log('Generi disponibili:', cachedData.genres);
        console.log('Genere richiesto:', genre);

        // Filtraggio canali
        let channels = [];
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre);
            console.log(`Filtrati ${channels.length} canali per genere: ${genre}`);
        } else if (search) {
            channels = CacheManager.searchChannels(search);
            console.log(`Trovati ${channels.length} canali per la ricerca: ${search}`);
        } else {
            channels = cachedData.channels;
            console.log(`Caricati tutti i canali: ${channels.length}`);
        }

        // Ordinamento canali (prima per numero di canale, poi per nome)
        channels.sort((a, b) => {
            const numA = a.streamInfo.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.streamInfo.tvg?.chno || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Paginazione
        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        // Arricchisci con dati EPG
        const metas = paginatedChannels.map(channel => 
            enrichWithEPG({ ...channel }, channel.streamInfo.tvg?.id)
        );

        // Costruisci la risposta
        const response = { metas };
        
        // Aggiungi i generi solo quando appropriato
        if (!search) {
            response.genres = cachedData.genres;
        }

        console.log('Risposta catalogo:', {
            numChannels: metas.length,
            hasGenres: !!response.genres,
            numGenres: response.genres?.length || 0
        });

        return response;

    } catch (error) {
        console.error('Errore nella gestione del catalogo:', error);
        return { metas: [], genres: [] };
    }
}

async function streamHandler({ id }) {
    try {
        console.log('Stream richiesto per id:', id);
        const channelName = id.split('|')[1].replace(/_/g, ' ');
        const channel = CacheManager.getChannel(channelName);

        if (!channel) {
            console.log('Canale non trovato:', channelName);
            return { streams: [] };
        }

        console.log('Canale trovato:', channel.name);

        // Crea stream diretto
        const streams = [{
            name: channel.name,
            title: channel.name,
            url: channel.streamInfo.url,
            behaviorHints: {
                notWebReady: false,
                bingeGroup: "tv"
            }
        }];

        // Aggiungi stream proxy se configurato
        if (config.PROXY_URL) {
            const proxyStreams = await ProxyManager.getProxyStreams({
                name: channel.name,
                url: channel.streamInfo.url,
                headers: channel.streamInfo.headers
            });
            streams.push(...proxyStreams);
        }

        // Aggiungi metadati a tutti gli stream
        streams.forEach(stream => {
            stream.meta = enrichWithEPG({ ...channel }, channel.streamInfo.tvg?.id);
        });

        return { streams };

    } catch (error) {
        console.error('Errore nel caricamento dello stream:', error);
        return { 
            streams: [{
                name: 'Errore',
                title: 'Errore nel caricamento dello stream',
                url: '',
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: "tv",
                    errorMessage: `Errore: ${error.message}`
                }
            }]
        };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
