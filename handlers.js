const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');
const ProxyManager = new (require('./proxy-manager'))(config);

// Funzione di utilità per creare l'oggetto meta del canale
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

    // Creiamo un ID sicuro rimuovendo caratteri problematici
    const safeId = `tv|${item.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

    return {
        id: safeId,
        type: 'tv',
        name: item.name,
        poster: item.tvg?.logo || 'https://www.stremio.com/website/stremio-white-small.png',
        background: item.tvg?.logo,
        logo: item.tvg?.logo,
        description: description,
        genres: [item.group],
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

// Handler per il catalogo
async function catalogHandler({ type, id, extra }) {
    try {
        console.log('Catalog richiesto con args:', JSON.stringify({ type, id, extra }, null, 2));
        const { search, genre } = extra || {};

        // Verifica se la cache è obsoleta
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        const cachedData = CacheManager.getCachedData();
        
        // Se è una richiesta per un ID specifico
        if (id && id.startsWith('tv|')) {
            const channelName = id.split('|')[1].replace(/_/g, ' ');
            const channel = CacheManager.getChannel(channelName);
            if (channel) {
                return {
                    metas: [createChannelMeta(channel)]
                };
            }
            return { metas: [] };
        }

        // Se c'è una richiesta di generi
        if (extra && extra.genre === '') {
            return {
                metas: [],
                genres: cachedData.genres.map(g => g.name)
            };
        }

        let channels = [];
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre);
        } else if (search) {
            channels = CacheManager.searchChannels(search);
        } else {
            channels = cachedData.m3u || [];
        }

        // Ordina i canali
        const sortedChannels = channels.length > 0 ? 
            [...channels].sort((a, b) => {
                const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
                const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
                return numA - numB || a.name.localeCompare(b.name);
            }) : [];

        const metas = sortedChannels.map(createChannelMeta);
        
        return { 
            metas,
            genres: cachedData.genres.map(g => g.name)
        };
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return { metas: [], genres: [] };
    }
}

// Handler per gli stream
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
        
        // Aggiungi le meta informazioni agli stream
        const meta = createChannelMeta(channel);
        streams.forEach(stream => {
            stream.meta = meta;
        });

        return { streams };
    } catch (error) {
        console.error('Errore nel caricamento dello stream:', error);
        return { streams: [] };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
