const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');

// Funzione per parsare la playlist M3U
async function parsePlaylist(url) {
    const m3uResponse = await axios.get(url);
    const m3uContent = m3uResponse.data;

    // Estrai i gruppi unici (generi)
    const groups = new Set();
    const items = [];

    // Dividi la playlist in righe
    const lines = m3uContent.split('\n');

    let currentItem = null;

    for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
            // Estrai i metadati del canale
            const metadata = line.substring(8).trim();
            const attributes = metadata.split(',');

            // Estrai i campi tvg-*
            const tvgAttributes = {};
            const tvgRegex = /([a-zA-Z-]+)="([^"]+)"/g;
            let match;
            while ((match = tvgRegex.exec(metadata)) !== null) {
                tvgAttributes[match[1]] = match[2];
            }

            // Estrai il nome del canale
            const channelName = attributes[attributes.length - 1].trim();

            // Estrai il gruppo (genere)
            const groupTitle = tvgAttributes['group-title'] || 'Altri';
            groups.add(groupTitle);

            // Crea l'oggetto canale
            currentItem = {
                name: channelName,
                url: '', // L'URL verrà impostato nella riga successiva
                tvg: {
                    id: tvgAttributes['tvg-id'] || null,
                    name: tvgAttributes['tvg-name'] || channelName,
                    logo: tvgAttributes['tvg-logo'] || null,
                    chno: tvgAttributes['tvg-chno'] ? parseInt(tvgAttributes['tvg-chno'], 10) : null
                },
                genres: [groupTitle],
                headers: {
                    'User-Agent': 'HbbTV/1.6.1' // Imposta un user-agent predefinito
                }
            };
        } else if (line.startsWith('http')) {
            // Imposta l'URL del canale
            if (currentItem) {
                currentItem.url = line.trim();
                items.push(currentItem);
                currentItem = null;
            }
        }
    }

    // Converti Set in Array e logga i gruppi trovati
    const uniqueGroups = [...groups];
    console.log('Gruppi unici trovati nel parser:', uniqueGroups);
    console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
    
    return { 
        items, 
        groups: uniqueGroups
    };
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
