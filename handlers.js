const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

/**
 * Arricchisce i metadati del canale con informazioni EPG
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
        console.log('Generi disponibili:', config.manifest.catalogs[0].extra[0].options);
        console.log('Genere richiesto:', genre);

        // Filtraggio canali
        let channels = [];
        if (genre) {
            // Filtra per genere specifico
            channels = cachedData.channels.filter(channel => 
                channel.genre && channel.genre.includes(genre)
            );
            console.log(`Filtrati ${channels.length} canali per genere: ${genre}`);
        } else if (search) {
            // Filtra per ricerca
            channels = cachedData.channels.filter(channel =>
                channel.name.toLowerCase().includes(search.toLowerCase())
            );
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

        // Crea i meta object per ogni canale
        const metas = paginatedChannels.map(channel => {
            const meta = {
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.poster,
                background: channel.background,
                logo: channel.logo,
                description: channel.description,
                genre: channel.genre, // Array di generi
                posterShape: channel.posterShape,
                runtime: channel.runtime,
                releaseInfo: channel.releaseInfo,
                behaviorHints: channel.behaviorHints
            };
            
            // Aggiungi informazioni EPG se disponibili
            return enrichWithEPG(meta, channel.streamInfo.tvg?.id);
        });

        const response = {
            metas,
            // Includi sempre i generi disponibili nella risposta
            genres: config.manifest.catalogs[0].extra[0].options
        };

        console.log('Risposta catalogo:', {
            numChannels: metas.length,
            hasGenres: true,
            numGenres: response.genres.length,
            genres: response.genres
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
            try {
                const proxyStreams = await ProxyManager.getProxyStreams({
                    name: channel.name,
                    url: channel.streamInfo.url,
                    headers: channel.streamInfo.headers
                });
                streams.push(...proxyStreams);
            } catch (proxyError) {
                console.error('Errore nella creazione dello stream proxy:', proxyError);
            }
        }

        // Aggiungi metadati a tutti gli stream
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster,
            background: channel.background,
            logo: channel.logo,
            description: channel.description,
            genre: channel.genre,
            posterShape: channel.posterShape,
            runtime: channel.runtime,
            releaseInfo: channel.releaseInfo,
            behaviorHints: channel.behaviorHints
        };

        // Arricchisci con EPG e aggiungi ai stream
        const enrichedMeta = enrichWithEPG(meta, channel.streamInfo.tvg?.id);
        streams.forEach(stream => {
            stream.meta = enrichedMeta;
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
