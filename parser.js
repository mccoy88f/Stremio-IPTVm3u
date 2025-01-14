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

        // Estrai i campi tvg-name e tvg-chno correttamente
        const tvgName = item.tvgName || item.name || null; // Usa il nome del canale come fallback
        const tvgChno = item.tvgChno || (item.tvg && item.tvg.chno) || null; // Estrai tvg-chno correttamente
        const chnoNumber = tvgChno ? parseInt(tvgChno, 10) : null; // Converti in numero

        // Log di debug per verificare i valori parsati
        console.log('Parsing channel:', item.name, 'tvg-chno:', tvgChno, 'Parsed chno:', chnoNumber);

        return {
            name: item.name || '',
            url: item.url || '',
            tvg: {
                id: item.tvgId || null,
                name: tvgName, // Usa il valore estratto
                logo: item.tvgLogo || null,
                chno: chnoNumber // Usa il valore convertito in numero
            },
            genres: [groupTitle],
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
