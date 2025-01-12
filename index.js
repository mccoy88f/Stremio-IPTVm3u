const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const { Parser } = require('m3u8-parser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

const builder = new addonBuilder({
    id: 'org.example.iptvaddon',
    version: '1.0.0',
    name: 'IPTV Italia Addon',
    description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
    resources: ['stream', 'catalog'],
    types: ['channel'],
    idPrefixes: ['tt'],
    catalogs: [] // Aggiungi questa linea
});

let cachedData = {
    m3u: null,
    epg: null,
    lastUpdated: null
};

const M3U_URL = process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u';

async function updateCache() {
    try {
        console.log('Aggiornamento della cache in corso...');

        const m3uResponse = await axios.get(M3U_URL);
        const parser = new Parser();
        parser.push(m3uResponse.data);
        parser.end();

        const epgResponse = await axios.get('https://iptv-org.github.io/epg/guides/it.xml.gz', {
            responseType: 'arraybuffer'
        });
        const decompressed = await new Promise((resolve, reject) => {
            zlib.gunzip(epgResponse.data, (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
            });
        });
        const epgData = await parseStringPromise(decompressed);

        cachedData = {
            m3u: parser.manifest.items,
            epg: epgData,
            lastUpdated: Date.now()
        };

        console.log('Cache aggiornata con successo!');
    } catch (error) {
        console.error('Errore nell\'aggiornamento della cache:', error);
    }
}

function getChannelInfo(epgData, channelName) {
    if (!epgData || !epgData.tv || !epgData.tv.channel) return {};

    const channel = epgData.tv.channel.find(ch => ch['display-name'][0].toLowerCase().includes(channelName.toLowerCase()));
    if (!channel) return {};

    return {
        icon: channel.icon ? channel.icon[0].$.src : '',
        description: channel['desc'] ? channel['desc'][0] : '',
        genres: channel.category ? channel.category.map(cat => cat._) : [],
        programs: channel.programme ? channel.programme.map(prog => ({
            title: prog.title[0],
            start: prog.start[0],
            stop: prog.stop[0],
            description: prog.desc ? prog.desc[0] : ''
        })) : []
    };
}

cron.schedule('0 3 * * *', () => {
    updateCache();
});

updateCache();

builder.defineCatalogHandler(async (args) => {
    try {
        const { search } = args.extra || {};

        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
        }

        const filteredChannels = cachedData.m3u
            .filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
            .map(item => {
                const channelName = item.name;
                const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);

                return {
                    id: channelName,
                    type: 'channel',
                    name: channelName,
                    poster: icon,
                    description: description,
                    genres: genres,
                    programs: programs
                };
            });

        return Promise.resolve({ metas: filteredChannels });
    } catch (error) {
        console.error('Errore nella ricerca dei canali:', error);
        return Promise.resolve({ metas: [] });
    }
});

builder.defineStreamHandler(async (args) => {
    try {
        if (!cachedData.m3u || !cachedData.epg) {
            await updateCache();
        }

        const streams = cachedData.m3u.map(item => {
            const channelName = item.name;
            const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);

            return {
                name: channelName,
                title: channelName,
                url: item.url,
                icon: icon,
                description: description,
                genres: genres,
                programs: programs,
                behaviorHints: {
                    notWebReady: true
                }
            };
        });

        return Promise.resolve({ streams });
    } catch (error) {
        console.error('Errore nel caricamento della playlist o dell\'EPG:', error);
        return Promise.resolve({ streams: [] });
    }
});

module.exports = builder.getInterface();
