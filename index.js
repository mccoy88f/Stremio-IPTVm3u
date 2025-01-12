const express = require('express');
const path = require('path');
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const { Parser } = require('iptv-playlist-parser'); // Usiamo iptv-playlist-parser
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 10000; // Usa la porta da Render o 10000 di default

// Configura il server per servire file statici
app.use(express.static(path.join(__dirname)));

// Configura il manifest dell'add-on
const builder = new addonBuilder({
  id: 'org.example.iptvaddon',
  version: '1.0.0',
  name: 'IPTV Italia Addon',
  description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
  resources: ['stream', 'catalog'],
  types: ['channel'],
  idPrefixes: ['tt'],
  catalogs: [
    {
      type: 'channel',
      id: 'italia',
      name: 'Canali Italia',
      extra: [
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
  lastUpdated: null
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
    console.log('Risposta M3U:', m3uResponse.data); // Debug

    // Usiamo iptv-playlist-parser per analizzare la playlist
    const parser = new Parser();
    const playlist = parser.parse(m3uResponse.data);

    console.log('Playlist M3U caricata correttamente. Numero di canali:', playlist.items.length);

    let epgData = null;
    if (enableEPG) {
      console.log('EPG abilitato. Scaricamento in corso...');
      try {
        const epgResponse = await axios.get(EPG_URL, {
          responseType: 'arraybuffer'
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
      m3u: playlist.items, // Usiamo playlist.items invece di parser.manifest.items
      epg: epgData,
      lastUpdated: Date.now()
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

// Handler per gli stream
builder.defineStreamHandler(async (args) => {
  try {
    if (!cachedData.m3u || !cachedData.epg) {
      await updateCache();
    }

    const streams = cachedData.m3u.map(item => {
      console.log('Stream URL:', item.url); // Log dei link agli stream
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

// Route per la homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route per il manifest dell'add-on
app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.example.iptvaddon',
    version: '1.0.0',
    name: 'IPTV Italia Addon',
    description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
    resources: ['stream', 'catalog'],
    types: ['channel'],
    idPrefixes: ['tt'],
    catalogs: [
      {
        type: 'channel',
        id: 'italia',
        name: 'Canali Italia',
        extra: [
          {
            name: 'search',
            isRequired: false
          }
        ]
      }
    ]
  });
});

// Avvia il server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});

// Esporta l'interfaccia dell'add-on
module.exports = builder.getInterface();

// Funzione per ottenere le informazioni del canale dall'EPG
function getChannelInfo(epgData, channelName) {
  if (!epgData) {
    return {
      icon: null,
      description: null,
      genres: [],
      programs: []
    };
  }

  const channelInfo = epgData.find(channel => channel.name === channelName);
  if (!channelInfo) {
    return {
      icon: null,
      description: null,
      genres: [],
      programs: []
    };
  }

  return {
    icon: channelInfo.icon,
    description: channelInfo.description,
    genres: channelInfo.genres || [],
    programs: channelInfo.programs || []
  };
}
