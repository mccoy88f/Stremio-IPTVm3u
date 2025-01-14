const axios = require('axios');
const { getChannelInfo } = require('./parser');
const { getCachedData, updateCache } = require('./cache');
const config = require('./config');

// Handler per la ricerca dei canali
async function catalogHandler(args, builder) {
    try {
        console.log('Catalog richiesto con args:', JSON.stringify(args, null, 2));
        const { search, genre } = args.extra || {};
        const cachedData = getCachedData();

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache(builder);
        }

        // Prima ordiniamo i canali nella cache
        const sortedChannels = [...cachedData.m3u].sort((a, b) => {
            const numA = a.tvg?.chno || Number.MAX_SAFE_INTEGER;
            const numB = b.tvg?.chno || Number.MAX_SAFE_INTEGER;
            if (numA !== numB) {
                return numA - numB;
            }
            return a.name.localeCompare(b.name);
        });

        // Poi applichiamo il filtro e la trasformazione
        const filteredChannels = sortedChannels
            .filter(item => {
                const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
                const matchesGenre = !genre || item.genres.includes(genre);
                return matchesSearch && matchesGenre;
            })
            .map(item => {
                const channelName = item.name;
                const { icon, description } = getChannelInfo(cachedData.epg, channelName);

                return {
                    id: 'tv' + channelName,
                    type: 'tv',
                    name: channelName,
                    poster: item.tvg?.logo || icon || 'https://www.stremio.com/website/stremio-white-small.png',
                    background: item.tvg?.logo || icon,
                    logo: item.tvg?.logo || icon,
                    description: description || `Nome canale: ${channelName}`,
                    genres: item.genres,
                    posterShape: 'square',
                    runtime: "LIVE",
                    releaseInfo: "Live TV",
                    behaviorHints: {
                        defaultVideoId: 'tv' + channelName
                    }
                };
            });

        console.log(`Trovati ${filteredChannels.length} canali`);
        return Promise.resolve({ metas: filteredChannels });
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return Promise.resolve({ metas: [] });
    }
}

// Handler per gli stream
async function streamHandler(args, builder) {
    try {
        console.log('Stream richiesto con args:', JSON.stringify(args, null, 2));
        const cachedData = getCachedData();

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache(builder);
        }

        const channelName = args.id.replace(/^tv/, '');
        console.log('Cerco canale con nome:', channelName);

        const channel = cachedData.m3u.find(item => item.name === channelName);

        if (!channel) {
            console.log('Canale non trovato. Nome cercato:', channelName);
            return Promise.resolve({ streams: [] });
        }

        console.log('Canale trovato:', channel);

        const userAgent = channel.headers?.['User-Agent'] || 'HbbTV/1.6.1';
        const streams = [];

        // Stream diretto
        streams.push({
            title: `${channel.name} (Diretto)`,
            url: channel.url,
            behaviorHints: {
                bingeGroup: "tv"
            }
        });

        // Stream proxy se configurato
        if (config.PROXY_URL && config.PROXY_PASSWORD) {
            const proxyStreamUrl = `${config.PROXY_URL}/proxy/hls/manifest.m3u8?api_password=${config.PROXY_PASSWORD}&d=${encodeURIComponent(channel.url)}&h_User-Agent=${encodeURIComponent(userAgent)}`;
            console.log('Tentativo di accesso al proxy stream:', proxyStreamUrl);

            try {
                const response = await axios.get(proxyStreamUrl, { timeout: 5000, validateStatus: false });
                console.log('Risposta dal proxy:', response.status);

                if (response.status === 200 || response.status === 302) {
                    console.log('Proxy stream disponibile, aggiungo alla lista');
                    streams.push({
                        title: `${channel.name} (Media Proxy)`,
                        url: proxyStreamUrl,
                        behaviorHints: {
                            bingeGroup: "tv"
                        }
                    });
                } else {
                    console.log('Proxy stream ha restituito uno status non valido:', response.status);
                }
            } catch (error) {
                if (error.response?.status === 403) {
                    console.error('Errore 403: Accesso negato al proxy');
                    streams.push({
                        title: `${channel.name} (Errore: Accesso Negato)`,
                        url: '',
                        behaviorHints: {
                            bingeGroup: "tv",
                            errorMessage: "Accesso negato. Potrebbe essere necessario utilizzare una VPN o verificare la tua posizione."
                        }
                    });
                } else {
                    console.error('Errore nel caricamento del proxy stream:', error.message);
                }
            }
        } else {
            console.log('Proxy non configurato, skip proxy stream');
        }

        console.log('Stream generati:', JSON.stringify(streams, null, 2));
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
