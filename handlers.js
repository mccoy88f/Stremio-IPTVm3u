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
        if (upcoming.length > 0) {
            description += '\n\nProssimi programmi:\n' + upcoming
                .map(p => `- ${p.title} (${p.start.toLocaleTimeString()})`)
                .join('\n');
        }
    }

    return {
        id: `tv${item.name}`,
        type: 'tv',
        name: item.name,
        poster: item.tvg?.logo || 'https://www.stremio.com/website/stremio-white-small.png',
        background: item.tvg?.logo,
        logo: item.tvg?.logo,
        description: description,
        genres: item.genres || [],
        posterShape: 'square',
        runtime: "LIVE",
        releaseInfo: epgData ? `In onda: ${epgData.title}` : "Live TV",
        behaviorHints: {
            defaultVideoId: `tv${item.name}`,
            isLive: true,
            hasSchedule: !!config.enableEPG
        }
    };
}

// Handler per la ricerca dei canali
async function catalogHandler({ extra }) {
    try {
        console.log('Catalog richiesto con args:', JSON.stringify(extra, null, 2));
        const { search, genre } = extra || {};
        const cachedData = CacheManager.getCachedData();

        // Verifica se la cache è obsoleta
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        let channels;
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre);
        } else if (search) {
            channels = CacheManager.searchChannels(search);
        } else {
            channels = cachedData.m3u;
        }

        // Ordina i canali
        const sortedChannels = channels.sort((a, b) => {
            const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        const metas = sortedChannels.map(createChannelMeta);
        console.log(`Trovati ${metas.length} canali`);
        return { metas };
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return { metas: [] };
    }
}

// Handler per gli stream
async function streamHandler({ id }) {
    try {
        console.log('Stream richiesto per id:', id);
        const channelName = id.replace(/^tv/, '');
        const channel = CacheManager.getChannel(channelName);

        if (!channel) {
            console.log('Canale non trovato:', channelName);
            return { streams: [] };
        }

        console.log('Canale trovato:', channel.name);
        return { streams: await ProxyManager.getProxyStreams(channel) };
    } catch (error) {
        console.error('Errore nel caricamento dello stream:', error);
        return { streams: [] };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
