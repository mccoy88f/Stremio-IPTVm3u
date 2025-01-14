const axios = require('axios');
const { parseM3U } = require('@iptv/playlist');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');

// Funzione per parsare la playlist M3U
async function parsePlaylist(url) {
    const m3uResponse = await axios.get(url);
    const playlist = parseM3U(m3uResponse.data);

    // Estrai i gruppi unici
    const groups = new Set();

    const items = playlist.channels.map(item => {
        const groupTitle = item.groupTitle || 'Altri';
        groups.add(groupTitle);

        return {
            name: item.name || '',
            url: item.url || '',
            tvg: {
                id: item.tvgId || null,
                name: item.tvgName || null,
                logo: item.tvgLogo || null,
                chno: item.tvgChno || null
            },
            genres: [groupTitle], // Usa il group-title come genere
            headers: {
                'User-Agent': (item.extras?.['http-user-agent'] || item.extras?.['user-agent'] || 'HbbTV/1.6.1')
            }
        };
    });

    return { items, groups };
}

// Funzione per scaricare e parsare l'EPG
async function parseEPG(url) {
    try {
        const epgResponse = await axios.get(url, { responseType: 'arraybuffer' });
        const decompressed = await new Promise((resolve, reject) => {
            zlib.gunzip(epgResponse.data, (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
            });
        });
        return await parseStringPromise(decompressed);
    } catch (error) {
        console.error('Errore nel parsing dell\'EPG:', error);
        throw error;
    }
}

// Funzione per ottenere le informazioni del canale dall'EPG
function getChannelInfo(epgData, channelName) {
    if (!epgData) {
        return {
            icon: null,
            description: null
        };
    }

    const channelInfo = epgData.find(channel => channel.name === channelName);
    if (!channelInfo) {
        return {
            icon: null,
            description: null
        };
    }

    return {
        icon: channelInfo.icon,
        description: channelInfo.description
    };
}

module.exports = {
    parsePlaylist,
    parseEPG,
    getChannelInfo
};
