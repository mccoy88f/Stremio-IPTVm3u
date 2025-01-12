const addonSDK = require('stremio-addon-sdk');
const { addonBuilder, serveHTTP } = addonSDK;
const axios = require('axios');
const parser = require('iptv-playlist-parser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

const port = process.env.PORT || 10000;

// Configura il manifest dell'add-on
const builder = new addonBuilder({
  id: 'org.mccoy88f.iptvaddon',
  version: '1.0.1',
  name: 'IPTV Italia Addon',
  description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
  resources: ['stream', 'catalog'],
  types: ['channel'],
  idPrefixes: ['channel_'],
  catalogs: [
    {
      type: 'channel',
      id: 'italia',
      name: 'Canali Italia',
      extra: [
        {
          name: 'search',
          isRequired: false,
        },
      ],
    },
  ],
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
          console.warn('Impossibile caricare l\'EPG e nessuna cache disponibile.');
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
    throw error;
  }
}

// Funzione per ottenere le informazioni del canale dall'EPG
function getChannelInfo(epgData, channelName) {
  if (!epgData || !channelName) {
    return {
      icon: null,
      description: null,
      genres: ['TV'],
      programs: [],
    };
  }

  try {
    // Ricerca più flessibile del canale
    const channelInfo = epgData.tv?.channel?.find(channel => 
      channel.$.id.toLowerCase().includes(channelName.toLowerCase()) || 
      channelName.toLowerCase().includes(channel.$.id.toLowerCase())
    );

    if (!channelInfo) {
      return {
        icon: null,
        description: 'Canale TV Italiano',
        genres: ['TV'],
        programs: [],
      };
    }

    // Estrai icona e descrizione
    const icon = channelInfo['icon']?.[0]?.$.src || null;
    const displayName = channelInfo['display-name']?.[0]?._ || channelName;

    return {
      icon: icon,
      description: displayName,
      genres: ['TV'],
      programs: [],
    };
  } catch (error) {
    console.error(`Errore nell'elaborazione delle informazioni per ${channelName}:`, error);
    return {
      icon: null,
      description: 'Canale TV Italiano',
      genres: ['TV'],
      programs: [],
    };
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

    if (!cachedData.m3u) {
      await updateCache();
    }

    const filteredChannels = cachedData.m3u
      .filter(item => !search || item.name.toLowerCase().includes(search.toLowerCase()))
      .map(item => {
        const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, item.name);

        return {
          id: `channel_${item.name}`, // Aggiungi un prefisso per rendere l'ID unico
          type: 'channel',
          name: item.name,
          poster: icon,
          background: icon,
          logo: icon,
          description: description || 'Canale TV Italiano',
          genres: genres || ['TV'],
          releaseInfo: '', 
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
    if (!cachedData.m3u) {
      await updateCache();
    }

    // Rimuovi il prefisso 'channel_' dall'ID
    const channelName = args.id.replace(/^channel_/, '');

    // Trova il canale specifico richiesto
    const requestedChannel = cachedData.m3u.find(item => 
      item.name.toLowerCase() === channelName.toLowerCase()
    );

    if (!requestedChannel) {
      return Promise.resolve({ streams: [] });
    }

    // Ottieni le informazioni del canale dall'EPG
    const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, requestedChannel.name);

    // Crea lo stream con informazioni più complete
    const stream = {
      name: requestedChannel.name,
      title: requestedChannel.name,
      url: requestedChannel.url,
      
      // Metadati aggiuntivi
      thumbnail: icon,
      logo: icon,
      description: description || '',
      genres: genres || [],
      
      // Aggiungi hint per la riproduzione
      behaviorHints: {
        // Opzionale: aggiungi hint specifici se necessario
      }
    };

    return Promise.resolve({ streams: [stream] });
  } catch (error) {
    console.error('Errore nel caricamento dello stream:', error);
    return Promise.resolve({ streams: [] });
  }
});

// Avvia il server HTTP
serveHTTP(builder.getInterface(), { port: port });

// Se vuoi pubblicare l'addon su Stremio Central, usa questa riga:
// publishToCentral("https://<your-domain>/manifest.json");

console.log(`Addon avviato sulla porta ${port}`);
