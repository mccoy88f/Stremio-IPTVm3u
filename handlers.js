const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

function createChannelMeta(item) {
    const epgData = EPGManager.getCurrentProgram(item.tvg?.id);
    const upcoming = EPGManager.getUpcomingPrograms(item.tvg?.id, 3);
    
    let description = `Canale: ${item.name}\n`;
    if (epgData) {
        description += `\nIn onda: ${epgData.title}\n${epgData.description || ''}`;
        if (upcoming && upcoming.length > 0) {
            description += '\n\nProssimi programmi:\n' + upcoming
                .map(p => `- ${p.title} (${p.start.toLocaleTimeString()})`)
                .join('\n');
        }
    }

    const safeId = `tv|${item.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Importante: usa genre invece di genres
    return {
        id: safeId,
        type: 'tv',
        name: item.name,
        poster: item.tvg?.logo || 'https://www.stremio.com/website/stremio-white-small.png',
        background: item.tvg?.logo,
        logo: item.tvg?.logo,
        description: description,
        genre: item.group ? [item.group] : [], // Cambio cruciale: genre invece di genres
        posterShape: 'square',
        runtime: "LIVE",
        releaseInfo: epgData ? `In onda: ${epgData.title}` : "Live TV",
        behaviorHints: {
            defaultVideoId: safeId,
            isLive: true,
            hasSchedule: !!config.enableEPG
        }
    };
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

        // Log importante per debug
        console.log('Generi disponibili:', cachedData.genres.map(g => g.name));
        console.log('Genere richiesto:', genre);

        // Gestione esplicita del caso "genre" vuoto
        if (genre === '') {
            console.log('Richiesta lista generi');
            // Restituisci un campione di canali insieme ai generi
            const sampleChannels = cachedData.m3u.slice(0, 5);
            return {
                metas: sampleChannels.map(createChannelMeta),
                genres: cachedData.genres.map(g => g.name)
            };
        }

        // Filtraggio canali
        let channels = [];
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre);
            console.log(`Filtrati ${channels.length} canali per genere: ${genre}`);
        } else if (search) {
            channels = CacheManager.searchChannels(search);
            console.log(`Trovati ${channels.length} canali per la ricerca: ${search}`);
        } else {
            channels = cachedData.m3u || [];
            console.log(`Caricati tutti i canali: ${channels.length}`);
        }

        // Ordinamento
        channels.sort((a, b) => {
            const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Paginazione
        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        
        // Creazione metadati
        const metas = paginatedChannels.map(createChannelMeta);

        // Costruzione risposta
        const response = { metas };
        
        // Aggiungi i generi solo quando appropriato
        if (!search && !genre) {
            response.genres = cachedData.genres.map(g => g.name);
        }

        console.log('Risposta catalogo:', {
            numChannels: metas.length,
            hasGenres: !!response.genres,
            numGenres: response.genres ? response.genres.length : 0
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
        const streams = await ProxyManager.getProxyStreams(channel);
        
        // Aggiungi meta informazioni agli stream
        const meta = createChannelMeta(channel);
        streams.forEach(stream => {
            stream.meta = meta;
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
