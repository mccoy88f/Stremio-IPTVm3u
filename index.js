const addonSDK = require('stremio-addon-sdk');
const { addonBuilder, serveHTTP } = addonSDK;
const cron = require('node-cron');
const axios = require('axios');
const { parsePlaylist, parseEPG, getChannelInfo } = require('./parser');

const port = process.env.PORT || 10000;

// Configura il manifest dell'add-on
const builder = new addonBuilder({
    id: 'org.mccoy88f.iptvaddon',
    version: '1.0.0',
    name: 'IPTV Italia Addon',
    description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
    logo: 'https://github.com/mccoy88f/Stremio-IPTVm3u/blob/main/tv.png?raw=true',
    resources: ['stream', 'catalog'],
    types: ['tv', 'channel'],
    idPrefixes: ['tv'],
    catalogs: [
        {
            type: 'tv',
            id: 'iptvitalia',
            name: 'Canali TV Italia',
            extra: [
                {
                    name: 'genre',
                    isRequired: false,
                    options: [] // Sarà popolato dinamicamente dai gruppi della playlist
                },
                {
                    name: 'search',
                    isRequired: false
                }
            ]
        }
    ]
});

let cachedData = {
    m3u: null,
    epg: null,
    lastUpdated: null,
    groups: new Set()
};

// Leggi le configurazioni dalle variabili d'ambiente
const M3U_URL = process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u';
const EPG_URL = 'https://www.epgitalia.tv/gzip';
const enableEPG = process.env.ENABLE_EPG === 'yes';
const PROXY_URL = process.env.PROXY_URL || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;

// Funzione per aggiornare la cache
async function updateCache() {
    try {
        console.log('Aggiornamento della cache in corso...');

        // Parsa la playlist M3U
        const { items, groups } = await parsePlaylist(M3U_URL);
        console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
        console.log('Gruppi trovati:', [...groups]);

        // Aggiorna le opzioni delle categorie nel manifest
        builder.manifest.catalogs[0].extra[1].options = [...groups].map(group => ({
            name: group,
            value: group
        }));

        // Gestisci l'EPG se abilitato
        let epgData = null;
        if (enableEPG) {
            console.log('EPG abilitato. Scaricamento in corso...');
            try {
                epgData = await parseEPG(EPG_URL);
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
            groups: groups
        };

        console.log('Cache aggiornata con successo!');
    } catch (error) {
        console.error('Errore nell\'aggiornamento della cache:', error);
        throw error;
    }
}

// Aggiorna la cache all'avvio
updateCache().then(() => {
    console.log('Cache aggiornata con successo all\'avvio.');
}).catch((err) => {
    console.error('Errore durante l\'aggiornamento della cache all\'avvio:', err);
});

// Aggiorna la cache ogni giorno alle 3:00 del mattino (solo se l'EPG è abilitato)
if (enableEPG) {
    cron.schedule('0 3 * * *', () => {
        updateCache();
    });
}

// Handler per la ricerca dei canali
builder.defineCatalogHandler(async (args) => {
    try {
        console.log('Catalog richiesto con args:', JSON.stringify(args, null, 2));
        const { search, genre } = args.extra || {};

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
        }

        const filteredChannels = cachedData.m3u
            .filter(item => {
                const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
                const matchesGenre = !genre || item.group.title === genre;
                return matchesSearch && matchesGenre;
            })
            .map(item => {
                const channelName = item.name;
                const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);

                // Estrai le informazioni dalla playlist M3U
                const tvgLogo = item.tvg?.logo || null;
                const groupTitle = item.group?.title || null;
                const tvgId = item.tvg?.id || null;
                const channelNumber = item.tvg?.chno || null;

                // Crea una chiave di ordinamento basata sul numero del canale
                const sortingKey = channelNumber ? `${channelNumber}. ${channelName}` : channelName;

                // Crea una descrizione base se l'EPG non è disponibile
                const baseDescription = [
                    `Nome canale: ${channelName}`,
                    tvgId ? `ID canale: ${tvgId}` : null,
                    channelNumber ? `Numero canale: ${channelNumber}` : null,
                    groupTitle ? `Gruppo: ${groupTitle}` : null,
                    `\nQuesta playlist è fornita da: ${M3U_URL}`,
                    enableEPG ? null : '\nNota: EPG non abilitato'
                ].filter(Boolean).join('\n');

                // Meta object con i campi aggiuntivi per lo streaming
                const meta = {
                    id: 'tv' + channelName,
                    type: 'tv',
                    name: channelName,
                    poster: tvgLogo || icon || 'https://www.stremio.com/website/stremio-white-small.png',
                    background: tvgLogo || icon,
                    logo: tvgLogo || icon,
                    description: description || baseDescription,
                    genres: [groupTitle || 'Altri'],
                    posterShape: 'square',
                    streams: [], // Indica che il contenuto ha degli stream
                    videos: [], // Indica che è un contenuto riproducibile
                    runtime: "LIVE", // Indica che è un contenuto live
                    sortingKey: sortingKey
                };

                return meta;
            });

        // Ordina i canali per numero
        filteredChannels.sort((a, b) => {
            const getChannelNumber = (key) => {
                const match = key.match(/^(\d+)\./);
                return match ? parseInt(match[1]) : Number.MAX_SAFE_INTEGER;
            };
            
            const numA = getChannelNumber(a.sortingKey);
            const numB = getChannelNumber(b.sortingKey);
            
            if (numA !== numB) {
                return numA - numB;
            }
            return a.name.localeCompare(b.name);
        });

        console.log(`Trovati ${filteredChannels.length} canali`);
        return Promise.resolve({ metas: filteredChannels });
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return Promise.resolve({ metas: [] });
    }
});

// Handler per gli stream
builder.defineStreamHandler(async (args) => {
    try {
        console.log('Stream richiesto con args:', JSON.stringify(args, null, 2));
        
        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
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
        if (PROXY_URL && PROXY_PASSWORD) {
            // Costruisci l'URL del proxy con i parametri richiesti
            const proxyStreamUrl = `${PROXY_URL}/proxy/hls/manifest.m3u8?api_password=${PROXY_PASSWORD}&d=${encodeURIComponent(channel.url)}&h_User-Agent=${encodeURIComponent(userAgent)}`;
            console.log('Tentativo di accesso al proxy stream:', proxyStreamUrl);

            try {
                const response = await axios.get(proxyStreamUrl, { 
                    timeout: 5000,
                    validateStatus: false
                });
                
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
});

// Avvia il server HTTP
serveHTTP(builder.getInterface(), { port: port });
