const addonSDK = require('stremio-addon-sdk');
const { addonBuilder, serveHTTP } = addonSDK;
const axios = require('axios');
const parser = require('iptv-playlist-parser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');
const path = require('path');
const express = require('express');

const port = process.env.PORT || 10000;
const defaultLogoUrl = `${process.env.BASE_URL || 'http://localhost:' + port}/tv.png`;

// Funzione per ottenere i cataloghi dai group-title
function getCatalogs(m3uItems) {
    if (!m3uItems || !m3uItems.length) return [{
        type: 'tv',
        id: 'iptvitalia',
        name: 'Tutti i Canali',
        extra: [{ name: 'search', isRequired: false }]
    }];

    // Estrai tutti i group-title unici
    const groups = [...new Set(m3uItems
        .filter(item => item.group && item.group.title)
        .map(item => item.group.title))];

    // Crea un catalogo per ogni gruppo
    const groupCatalogs = groups.map(group => ({
        type: 'tv',
        id: `tv_${group.toLowerCase().replace(/\s+/g, '_')}`,
        name: group,
        extra: [{ name: 'search', isRequired: false }]
    }));

    // Aggiungi il catalogo generale all'inizio
    return [
        {
            type: 'tv',
            id: 'iptvitalia',
            name: 'Tutti i Canali',
            extra: [{ name: 'search', isRequired: false }]
        },
        ...groupCatalogs
    ];
}

// Configura il manifest dell'add-on
const builder = new addonBuilder({
    id: 'org.mccoy88f.iptvaddon',
    version: '1.0.0',
    name: 'IPTV Italia Addon',
    description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
    resources: ['stream', 'catalog', 'meta'],
    types: ['tv'],
    idPrefixes: ['tv'],
    logo: `${process.env.BASE_URL || 'http://localhost:' + port}/tv.png`,
    icon: `${process.env.BASE_URL || 'http://localhost:' + port}/tv.png`,
    catalogs: []
});

let cachedData = {
    m3u: null,
    epg: null,
    lastUpdated: null,
};

// Leggi l'URL della playlist M3U dalla variabile d'ambiente
const M3U_URL = process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u';

// URL dell'EPG funzionante
const EPG_URL = 'https://www.epgitalia.tv/gzip';

// Controlla se l'EPG è abilitato
const enableEPG = process.env.ENABLE_EPG === 'yes'; // EPG è disabilitato di default

// Funzione per aggiornare la cache
async function updateCache() {
    try {
        console.log('Aggiornamento della cache in corso...');

        // Scarica la playlist M3U
        const m3uResponse = await axios.get(M3U_URL);
        const playlist = parser.parse(m3uResponse.data);

        // Aggiorna i cataloghi nel manifest
        builder.manifest.catalogs = getCatalogs(playlist.items);

        // Debug: mostra le informazioni dei primi 3 canali
        console.log('Esempio dei primi 3 canali:');
        playlist.items.slice(0, 3).forEach(item => {
            console.log({
                name: item.name,
                tvg: item.tvg,
                group: item.group,
                url: item.url
            });
        });

        // Debug: mostra i gruppi trovati
        const groups = [...new Set(playlist.items
            .filter(item => item.group && item.group.title)
            .map(item => item.group.title))];
        console.log('Gruppi trovati:', groups);

        console.log('Playlist M3U caricata correttamente. Numero di canali:', playlist.items.length);

        let epgData = null;
        if (enableEPG) {
            console.log('EPG abilitato. Scaricamento in corso...');
            try {
                const epgResponse = await axios.get(EPG_URL, {
                    responseType: 'arraybuffer',
                });
                const decompressed = await new Promise((resolve, reject) => {
                    zlib.gunzip(epgResponse.data, (err, result) => {
                        if (err) reject(err);
                        else resolve(result.toString());
                    });
                });
                epgData = await parseStringPromise(decompressed);
                console.log('EPG caricato correttamente.');
            } catch (epgError) {
                console.error('Errore nel caricamento dell\'EPG:', epgError);
                if (cachedData.epg) {
                    epgData = cachedData.epg;
                    console.log('Utilizzo della cache EPG precedente.');
                } else {
                    throw new Error('Impossibile caricare l\'EPG e nessuna cache disponibile.');
                }
            }
        } else {
            console.log('EPG disabilitato. Saltato il caricamento.');
        }

        // Aggiorna la cache
        cachedData = {
            m3u: playlist.items,
            epg: epgData,
            lastUpdated: Date.now(),
        };

        console.log('Cache aggiornata con successo!');
    } catch (error) {
        console.error('Errore nell\'aggiornamento della cache:', error);
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
        const { search } = args.extra || {};
        const catalogId = args.id;

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
        }

        let filteredChannels = cachedData.m3u;

        // Filtra per categoria se non è il catalogo generale
        if (catalogId !== 'iptvitalia') {
            const groupName = catalogId.replace('tv_', '').replace(/_/g, ' ');
            filteredChannels = filteredChannels.filter(item => 
                item.group && item.group.title && 
                item.group.title.toLowerCase() === groupName.toLowerCase()
            );
        }

        // Applica il filtro di ricerca se presente
        if (search) {
            filteredChannels = filteredChannels.filter(item => 
                item.name.toLowerCase().includes(search.toLowerCase())
            );
        }

        const metas = filteredChannels.map(item => {
            const channelName = item.name;
            const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);
            
            const tvgLogo = item.tvg?.logo || null;
            const groupTitle = item.group?.title || null;
            const tvgId = item.tvg?.id || null;

            const baseDescription = [
                `Nome canale: ${channelName}`,
                tvgId ? `ID canale: ${tvgId}` : null,
                groupTitle ? `Gruppo: ${groupTitle}` : null,
                `\nQuesta playlist è fornita da: ${M3U_URL}`,
                enableEPG ? null : '\nNota: EPG non abilitato'
            ].filter(Boolean).join('\n');

            return {
                id: 'tv' + channelName,
                type: 'tv',
                name: channelName,
                poster: tvgLogo || icon || defaultLogoUrl,
                posterShape: 'square',
                background: tvgLogo || icon,
                description: description || baseDescription,
                genres: groupTitle ? [groupTitle] : (genres || ['TV']),
                releaseInfo: groupTitle || 'TV',
                logo: tvgLogo || icon
            };
        });

        console.log(`Trovati ${metas.length} canali per il catalogo ${catalogId}`);
        return Promise.resolve({ metas });
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

        // Rimuovi il prefisso 'tv' dall'ID per trovare il canale
        const channelName = args.id.replace(/^tv/, '');
        console.log('Cerco canale con nome:', channelName);

        // Trova il canale specifico richiesto
        const channel = cachedData.m3u.find(item => item.name === channelName);
        
        if (!channel) {
            console.log('Canale non trovato. Nome cercato:', channelName);
            return Promise.resolve({ streams: [] });
        }

        console.log('Canale trovato:', channel);

        const stream = {
            id: channel.url,
            title: channel.name,
            type: 'tv',
            url: channel.url,
            name: 'IPTV Stream',
            behaviorHints: {
                notWebReady: true,
                bingeGroup: "tv"
            }
        };

        if (channel.tvg && channel.tvg.logo) {
            stream.thumbnail = channel.tvg.logo;
        }

        console.log('Stream generato:', JSON.stringify(stream, null, 2));
        return Promise.resolve({ streams: [stream] });

    } catch (error) {
        console.error('Errore nel caricamento dello stream:', error);
        return Promise.resolve({ streams: [] });
    }
});

// Handler per la ricerca globale
builder.defineMetaHandler(async ({ type, id }) => {
    try {
        console.log('Meta richiesto per:', { type, id });

        if (type !== 'tv') {
            return Promise.resolve({ meta: null });
        }

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
        }

        // Rimuovi il prefisso 'tv' dall'ID per trovare il canale
        const channelName = id.replace(/^tv/, '');
        const channel = cachedData.m3u.find(item => item.name === channelName);

        if (!channel) {
            console.log('Canale non trovato:', channelName);
            return Promise.resolve({ meta: null });
        }

        const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);
        const tvgLogo = channel.tvg?.logo || null;
        const groupTitle = channel.group?.title || null;
        const tvgId = channel.tvg?.id || null;

        const baseDescription = [
            `Nome canale: ${channelName}`,
            tvgId ? `ID canale: ${tvgId}` : null,
            groupTitle ? `Gruppo: ${groupTitle}` : null,
            `\nQuesta playlist è fornita da: ${M3U_URL}`,
            enableEPG ? null : '\nNota: EPG non abilitato'
        ].filter(Boolean).join('\n');

        const meta = {
            id: id,
            type: 'tv',
            name: channelName,
            poster: tvgLogo || icon || defaultLogoUrl,
            posterShape: 'square',
            background: tvgLogo || icon,
            description: description || baseDescription,
            genres: groupTitle ? [groupTitle] : (genres || ['TV']),
            releaseInfo: groupTitle || 'TV',
            logo: tvgLogo || icon
        };

        return Promise.resolve({ meta });
    } catch (error) {
        console.error('Errore nel caricamento del meta:', error);
        return Promise.resolve({ meta: null });
    }
});

// Funzione per ottenere le informazioni del canale dall'EPG
function getChannelInfo(epgData, channelName) {
    if (!epgData) {
        return {
            icon: null,
            description: null,
            genres: [],
            programs: [],
        };
    }

    const channelInfo = epgData.find(channel => channel.name === channelName);
    if (!channelInfo) {
        return {
            icon: null,
            description: null,
            genres: [],
            programs: [],
        };
    }

    return {
        icon: channelInfo.icon,
        description: channelInfo.description,
        genres: channelInfo.genres || [],
        programs: channelInfo.programs || [],
    };
}

// Configurazione del server HTTP
const app = express();

// Servi i file statici dalla directory corrente
app.use(express.static(__dirname));

// Crea il server con l'addon e l'app express
serveHTTP(builder.getInterface(), { app, port });
