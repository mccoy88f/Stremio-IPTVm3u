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

    return {
        id: safeId,
        type: 'tv',
        name: item.name,
        poster: item.tvg?.logo || 'https://www.stremio.com/website/stremio-white-small.png',
        background: item.tvg?.logo,
        logo: item.tvg?.logo,
        description: description,
        genres: [item.group], // Aggiungi il gruppo come genere
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

        // Se viene richiesta la lista dei generi
        if (genre === '') {
            console.log('Richiesta lista generi');
            return {
                metas: [],
                genres: cachedData.genres.map(g => g.name) // Restituisci i generi disponibili
            };
        }

        // Filtra i canali in base al genere se specificato
        let channels = [];
        if (genre) {
            channels = CacheManager.getChannelsByGenre(genre); // Filtra per genere
            console.log(`Filtrati ${channels.length} canali per genere: ${genre}`);
        } else if (search) {
            channels = CacheManager.searchChannels(search); // Filtra per ricerca
            console.log(`Trovati ${channels.length} canali per la ricerca: ${search}`);
        } else {
            channels = cachedData.m3u || []; // Tutti i canali se nessun filtro
        }

        // Ordina i canali per numero (se disponibile) o per nome
        channels.sort((a, b) => {
            const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Paginazione
        const startIdx = parseInt(skip) || 0;
        const paginatedChannels = channels.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        const metas = paginatedChannels.map(createChannelMeta);

        return {
            metas,
            genres: cachedData.genres.map(g => g.name) // Restituisci i generi disponibili
        };

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
        return { streams: [] };
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
