const express = require('express');
const path = require('path');
const addonSDK = require('stremio-addon-sdk');
const { addonBuilder } = addonSDK;
const axios = require('axios');
const parser = require('iptv-playlist-parser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

// Porta unica per Express e l'addon Stremio
const port = process.env.PORT || 10000;

// Configura il manifest dell'add-on
const builder = new addonBuilder({
  id: 'org.mccoy88f.iptvaddon',
  version: '1.5.0',
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

    // Recupera i parametri del proxy dalla query string
    const proxyUrl = args.extra?.proxyUrl;
    const proxyPassword = args.extra?.proxyPassword;

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

    // Stream diretto (senza media proxy)
    const directStream = {
      title: `${channel.name} (Diretto)`,
      url: channel.url,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: "tv"
      }
    };

    const streams = [directStream];

    // Se è stato configurato un media proxy, aggiungi uno stream che passa attraverso il proxy
    if (proxyUrl) {
      const proxyParams = new URLSearchParams();
      if (proxyPassword) proxyParams.append('password', proxyPassword);
      proxyParams.append('url', channel.url);

      const proxyStreamUrl = `${proxyUrl}?${proxyParams.toString()}`;

      const proxyStream = {
        title: `${channel.name} (Media Proxy)`,
        url: proxyStreamUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "tv"
        }
      };

      streams.push(proxyStream);  // Aggiungi lo stream con il media proxy alla lista
    }

    console.log('Stream generati:', JSON.stringify(streams, null, 2));
    return Promise.resolve({ streams });

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

// Configura Express per servire il file index.html
const app = express();

// Servi il file index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Servi il file manifest.json
app.get('/manifest.json', (req, res) => {
  res.json(builder.getInterface().manifest);
});

// Avvia il server Express
app.listen(port, '0.0.0.0', () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});
