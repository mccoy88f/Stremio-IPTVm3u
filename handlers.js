const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

function normalizeChannelName(name) {
    const normalized = name
        .replace(/_/g, ' ')          // Sostituisce underscore con spazi
        .replace(/\s+/g, ' ')        // Normalizza spazi multipli
        .replace(/\./g, '')          // Rimuove i punti
        .replace(/(\d+)[\s.]*(\d+)/g, '$1$2') // Unisce i numeri (102.5 o 102 5 -> 1025)
        .trim()                      // Rimuove spazi iniziali e finali
        .toLowerCase();              // Converte in minuscolo per confronto case-insensitive
    
    return normalized;
}

/**
 * Arricchisce i metadati del canale con informazioni EPG
 */
function enrichWithEPG(meta, channelId) {
    if (!config.enableEPG) return meta;
    
    const epgData = EPGManager.getCurrentProgram(channelId);
    console.log('Dati EPG trovati:', epgData ? 'Si' : 'No');

    const upcoming = EPGManager.getUpcomingPrograms(channelId, 3);
    console.log('Programmi futuri trovati:', upcoming.length);

    
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
        console.log('[Handlers] Catalog richiesto con args:', JSON.stringify({ type, id, extra }, null, 2));
        
        // Aggiorna la cache se necessario
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        const { search, genre, skip = 0 } = extra || {};
        const ITEMS_PER_PAGE = 100;


        // Filtraggio canali
        let channels = [];
        if (genre) {
            // Filtra per genere specifico
            channels = cachedData.channels.filter(channel => 
                channel.genre && channel.genre.includes(genre)
            );
            console.log(`[Handlers] Filtrati ${channels.length} canali per genere: ${genre}`);
        } else if (search) {
            // Filtra per ricerca
            const normalizedSearch = normalizeChannelName(search);
            channels = cachedData.channels.filter(channel => {
                const normalizedName = normalizeChannelName(channel.name);
                return normalizedName.includes(normalizedSearch);
            });
            console.log(`[Handlers] Trovati ${channels.length} canali per la ricerca: ${search}`);
        } else {
            channels = cachedData.channels;
            console.log(`[Handlers] Caricati tutti i canali: ${channels.length}`);
        }

        // Ordinamento canali
        channels.sort((a, b) => {
            const numA = a.streamInfo?.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.streamInfo?.tvg?.chno || Number.MAX_SAFE_INTEGER;
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
                genre: channel.genre,
                posterShape: channel.posterShape,
                releaseInfo: channel.releaseInfo,
                behaviorHints: channel.behaviorHints
            };
            
            // Aggiungi informazioni EPG se disponibili
            return enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        });

        // Sempre includi i generi nella risposta
        const response = {
            metas,
            genres: cachedData.genres
        };

        console.log('[Handlers] Risposta catalogo:', {
            numChannels: metas.length,
            hasGenres: true,
            numGenres: response.genres.length,
            genres: response.genres
        });

        return response;

    } catch (error) {
        console.error('[Handlers] Errore nella gestione del catalogo:', error);
        return { metas: [], genres: [] };
    }
}

async function streamHandler({ id }) {
    try {
        console.log('[Handlers] Stream richiesto per id:', id);
        const channelName = id.split('|')[1].replace(/_/g, ' ');
        // Debug: stampa tutti i canali disponibili
        const allChannels = CacheManager.getCachedData().channels;
        
        // Usa la funzione di normalizzazione per trovare il canale
        const normalizedSearchName = normalizeChannelName(channelName);
        const channel = allChannels.find(ch => {
            const normalizedChannelName = normalizeChannelName(ch.name);
            return normalizedChannelName === normalizedSearchName;
        });

        if (!channel) {
            console.log('[Handlers] Canale non trovato:', channelName);
            return { streams: [] };
        }

        console.log('[Handlers] Canale trovato:', channel.name);

        // Crea lo stream di base
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
        if (config.PROXY_URL && config.PROXY_PASSWORD) {
            const proxyStreams = await ProxyManager.getProxyStreams({
                name: channel.name,
                url: channel.streamInfo.url,
                headers: channel.streamInfo.headers
            });
            streams.push(...proxyStreams);
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
            releaseInfo: channel.releaseInfo,
            behaviorHints: channel.behaviorHints
        };

        // Arricchisci con EPG e aggiungi ai stream
        const enrichedMeta = enrichWithEPG(meta, channel.streamInfo?.tvg?.id);
        streams.forEach(stream => {
            stream.meta = enrichedMeta;
        });

        return { streams };
    } catch (error) {
        console.error('[Handlers] Errore nel caricamento dello stream:', error);
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
