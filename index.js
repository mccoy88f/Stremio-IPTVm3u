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
  version: '1.0.0',
  name: 'IPTV Italia Addon',
  description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
  logo: 'https://github.com/mccoy88f/Stremio-IPTVm3u/blob/main/tv.png?raw=true',
  resources: ['stream', 'catalog'],
  types: ['tv'],
  idPrefixes: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'iptvitalia',
      name: 'Canali TV Italia',
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

    if (!cachedData.m3u || !cachedData.epg) {
      await updateCache();
    }

    const filteredChannels = cachedData.m3u
      .filter(item => !search || item.name.toLowerCase().includes(search.toLowerCase()))
      .map(item => {
        const channelName = item.name;
        const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);
        
        // Estrai le informazioni aggiuntive dalla playlist M3U
        const tvgLogo = item.tvg?.logo || null;
        const groupTitle = item.group?.title || null;
        const tvgId = item.tvg?.id || null;

        // Crea una descrizione base se l'EPG non è disponibile
        const baseDescription = [
          `Nome canale: ${channelName}`,
          tvgId ? `ID canale: ${tvgId}` : null,
          groupTitle ? `Gruppo: ${groupTitle}` : null,
          `\nQuesta playlist è fornita da: ${M3U_URL}`,
          enableEPG ? null : '\nNota: EPG non abilitato'
        ].filter(Boolean).join('\n');

        const meta = {
          id: 'tv' + channelName,
          type: 'tv',
          name: channelName,
          poster: tvgLogo || icon || 'https://www.stremio.com/website/stremio-white-small.png',
          background: tvgLogo || icon,
          logo: tvgLogo || icon,
          description: description || baseDescription,
          genres: groupTitle ? [groupTitle] : (genres || ['TV']),
          posterShape: 'square'
        };

        console.log('Creato meta per canale:', JSON.stringify(meta, null, 2));
        return meta;
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
      title: channel.name,
      url: channel.url,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: "tv"
      }
    };

    console.log('Stream generato:', JSON.stringify(stream, null, 2));
    return Promise.resolve({ streams: [stream] });

  } catch (error) {
    console.error('Errore nel caricamento dello stream:', error);
    return Promise.resolve({ streams: [] });
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

// Avvia il server HTTP
serveHTTP(builder.getInterface(), { port: port });

// Se vuoi pubblicare l'addon su Stremio Central, usa questa riga:
// publishToCentral("https://<your-domain>/manifest.json");
