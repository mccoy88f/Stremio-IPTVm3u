const express = require('express');
const path = require('path');
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const { Parser } = require('m3u8-parser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 10000; // Usa la porta da Render o 7000 di default

// Configura il server per servire file statici (ad esempio, index.html)
app.use(express.static(path.join(__dirname)));

// Configura il manifest dell'add-on
const builder = new addonBuilder({
  id: 'org.example.iptvaddon',
  version: '1.0.0',
  name: 'IPTV Italia Addon',
  description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
  resources: ['stream', 'catalog'], // Aggiungi 'catalog' alle risorse
  types: ['channel'], // Definisci il tipo di contenuto
  idPrefixes: ['tt'],
  catalogs: [
    {
      type: 'channel', // Tipo di catalogo
      id: 'italia', // ID univoco per il catalogo
      name: 'Canali Italia', // Nome del catalogo
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

// Funzione per aggiornare la cache
async function updateCache() {
  try {
    console.log('Aggiornamento della cache in corso...');

    // Scarica la playlist M3U
    const m3uResponse = await axios.get(M3U_URL);
    const parser = new Parser();
    parser.push(m3uResponse.data);
    parser.end();

    // Prova a scaricare l'EPG
    let epgData = null;
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
    } catch (epgError) {
      console.error('Errore nel caricamento dell\'EPG:', epgError);
      // Utilizza una cache precedente se disponibile
      if (cachedData.epg) {
        epgData = cachedData.epg;
        console.log('Utilizzo della cache EPG precedente.');
      } else {
        throw new Error('Impossibile caricare l\'EPG e nessuna cache disponibile.');
      }
    }

    // Aggiorna la cache
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

// Funzione per ottenere l'icona e i metadati del canale dall'EPG
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

// Aggiorna la cache ogni giorno alle 3 di mattina
cron.schedule('0 3 * * *', () => {
  updateCache();
});

// Aggiorna la cache all'avvio dell'add-on
updateCache();

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
