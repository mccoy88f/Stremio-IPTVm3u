const axios = require('axios');
const { getChannelInfo } = require('./parser');
const { getCachedData } = require('./cache');
const config = require('./config');

// Funzione di utilità per creare l'oggetto meta del canale
function createChannelMeta(item, epgInfo = {}) {
    return {
        id: `tv${item.name}`,
        type: 'tv',
        name: item.name,
        poster: item.tvg?.logo || epgInfo.icon || 'https://www.stremio.com/website/stremio-white-small.png',
        background: item.tvg?.logo || epgInfo.icon,
        logo: item.tvg?.logo || epgInfo.icon,
        description: epgInfo.description || `Canale: ${item.name}`,
        genres: item.genres || [],
        posterShape: 'square',
        runtime: "LIVE",
        releaseInfo: "Live TV",
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
        const cachedData = getCachedData();

        // Prima ordiniamo i canali nella cache
        const sortedChannels = [...cachedData.m3u].sort((a, b) => {
            const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
            return numA - numB || a.name.localeCompare(b.name);
        });

        // Poi applichiamo il filtro e la trasformazione
        const filteredChannels = sortedChannels
            .filter(item => {
                const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
                const matchesGenre = !genre || (item.genres && item.genres.includes(genre));
                return matchesSearch && matchesGenre;
            })
            .map(item => {
                const epgInfo = getChannelInfo(cachedData.epg, item.name);
                return createChannelMeta(item, epgInfo);
            });

        console.log(`Trovati ${filteredChannels.length} canali`);
        return Promise.resolve({ metas: filteredChannels });
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return Promise.resolve({ metas: [] });
    }
}

// Handler per gli stream
async function streamHandler({ id }) {
    try {
        console.log('Stream richiesto per id:', id);
        const cachedData = getCachedData();
        const channelName = id.replace(/^tv/, '');
        
        console.log('Cerco canale con nome:', channelName);
        const channel = cachedData.m3u.find(item => item.name === channelName);

        if (!channel) {
            console.log('Canale non trovato:', channelName);
            return Promise.resolve({ streams: [] });
        }

        console.log('Canale trovato:', channel.name);
        const streams = [];
        const userAgent = channel.headers?.['User-Agent'] || 'HbbTV/1.6.1';

        // Stream diretto
        streams.push({
            name: `${channel.name} (Diretto)`,
            title: `${channel.name} (Diretto)`,
            url: channel.url,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: "tv"
            }
        });

        // Stream proxy se configurato
        if (config.PROXY_URL && config.PROXY_PASSWORD) {
            try {
                const proxyUrl = `${config.PROXY_URL}/proxy/hls/manifest.m3u8?api_password=${
                    config.PROXY_PASSWORD}&d=${encodeURIComponent(channel.url)
                    }&h_User-Agent=${encodeURIComponent(userAgent)}`;

                const response = await axios.head(proxyUrl, { timeout: 5000 });
                
                if (response.status === 200 || response.status === 302) {
                    streams.push({
                        name: `${channel.name} (Proxy)`,
                        title: `${channel.name} (Proxy HLS)`,
                        url: proxyUrl,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: "tv"
                        }
                    });
                }
            } catch (error) {
                console.error('Errore nel proxy stream:', error.message);
                if (error.response?.status === 403) {
                    streams.push({
                        name: `${channel.name} (Errore Proxy)`,
                        title: `${channel.name} (Errore: Accesso Negato)`,
                        url: '',
                        behaviorHints: {
                            notWebReady: true,
                            bingeGroup: "tv",
                            errorMessage: "Accesso negato. Verifica la tua posizione o usa una VPN."
                        }
                    });
                }
            }
        }

        console.log('Stream disponibili:', streams.length);
        return Promise.resolve({ streams });
    } catch (error) {
        console.error('Errore nel caricamento dello stream:', error);
        return Promise.resolve({ streams: [] });
    }
}

module.exports = {
    catalogHandler,
    streamHandler
};
