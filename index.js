const addonSDK = require('stremio-addon-sdk');
const { addonBuilder, serveHTTP } = addonSDK;
const axios = require('axios');
const { parseM3U } = require('@iptv/playlist');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const cron = require('node-cron');

const port = process.env.PORT || 10000;

// Configura il manifest dell'add-on
const builder = new addonBuilder({
  id: 'org.mccoy88f.iptvaddon',
  version: '1.1.0',
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
        }
      ]
    },
    {
      type: 'tv',
      id: 'iptvitalia-categories',
      name: 'Categorie',
      extra: [
        {
          name: 'genre',
          isRequired: true,
          options: [] // Verrà popolato dinamicamente con i gruppi
        }
      ]
    }
  ],
});

let cachedData = {
  m3u: null,
  epg: null,
  lastUpdated: null,
  groups: new Set()
};

// Leggi l'URL della playlist M3U dalla variabile d'ambiente
const M3U_URL = process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u';

// URL dell'EPG funzionante
const EPG_URL = 'https://www.epgitalia.tv/gzip';

// Controlla se l'EPG è abilitato
const enableEPG = process.env.ENABLE_EPG === 'yes';

// Leggi i parametri del proxy dalle variabili d'ambiente
const PROXY_URL = process.env.PROXY_URL || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;

// Funzione per aggiornare la cache
async function updateCache() {
  try {
    console.log('Aggiornamento della cache in corso...');

    // Scarica la playlist M3U
    const m3uResponse = await axios.get(M3U_URL);
    const playlist = parseM3U(m3uResponse.data);
    
    // Estrai i gruppi unici
    const groups = new Set();
    
    const items = playlist.channels.map(item => {
      const groupTitle = item.groupTitle || 'Altri Canali';
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
        group: {
          title: groupTitle
        },
        headers: {
          'User-Agent': (item.extras?.['http-user-agent'] || item.extras?.['user-agent'] || 'HbbTV/1.6.1')
        }
      };
    });

    console.log('Playlist M3U caricata correttamente. Numero di canali:', items.length);
    console.log('Gruppi trovati:', [...groups]);

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
      m3u: items,
      epg: epgData,
      lastUpdated: Date.now(),
      groups: groups
    };

    // Aggiorna dinamicamente il catalogo con i gruppi trovati
    builder.manifest.catalogs[1].extra[0].options = [...groups].map(group => ({
      name: group,
      value: group
    }));

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
    const { search, genre } = args.extra || {};

    if (!cachedData.m3u || !cachedData.epg) {
      await updateCache();
    }

    const filteredChannels = cachedData.m3u
      .filter(item => {
        // Filtra per ricerca e gruppo se specificati
        const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
        const matchesGenre = !genre || item.group.title === genre;
        return matchesSearch && matchesGenre;
      })
      .map(item => {
        const channelName = item.name;
        const { icon, description, genres, programs } = getChannelInfo(cachedData.epg, channelName);
        
        // Estrai le informazioni aggiuntive dalla playlist M3U
        const tvgLogo = item.tvg?.logo || null;
        const groupTitle = item.group?.title || null;
        const tvgId = item.tvg?.id || null;
        const channelNumber = item.tvg?.chno || null;

        // Crea una descrizione base se l'EPG non è disponibile
        const baseDescription = [
          `Nome canale: ${channelName}`,
          tvgId ? `ID canale: ${tvgId}` : null,
          channelNumber ? `Numero canale: ${channelNumber}` : null,
          groupTitle ? `Gruppo: ${groupTitle}` : null,
          `\nQuesta playlist è fornita da: ${M3U_URL}`,
          enableEPG ? null : '\nNota: EPG non abilitato'
        ].filter(Boolean).join('\n');

        const meta = {
          id: 'tv' + channelName,
          type: 'tv',
          name: channelNumber ? `${channelNumber}. ${channelName}` : channelName,
          poster: tvgLogo || icon || 'https://www.stremio.com/website/stremio-white-small.png',
          background: tvgLogo || icon,
          logo: tvgLogo || icon,
          description: description || baseDescription,
          genres: groupTitle ? [groupTitle] : (genres || ['TV']),
          posterShape: 'square'
        };

        return meta;
      });

    // Ordina i canali per numero se disponibile
    filteredChannels.sort((a, b) => {
      const numA = parseInt(a.name);
      const numB = parseInt(b.name);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.name.localeCompare(b.name);
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

    // Estrai l'User-Agent dalle intestazioni del canale
    const userAgent = channel.headers?.['User-Agent'] || 'HbbTV/1.6.1';

    const directStream = {
      title: `${channel.name} (Diretto)`,
      url: channel.url,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: "tv"
      }
    };

    const streams = [directStream];

    if (PROXY_URL) {
      // Costruisci l'URL del proxy con i parametri richiesti
      const proxyStreamUrl = `${PROXY_URL}/proxy/hls/manifest.m3u8?api_password=${PROXY_PASSWORD}&d=${encodeURIComponent(channel.url)}&h_User-Agent=${encodeURIComponent(userAgent)}`;

      try {
        const response = await axios.head(proxyStreamUrl);
        if (response.status === 200) {
          const proxyStream = {
            title: `${channel.name} (Media Proxy)`,
            url: proxyStreamUrl,
            behaviorHints: {
              notWebReady: false,
              bingeGroup: "tv"
            }
          };
          streams.push(proxyStream);
        }
      } catch (error) {
        if (error.response && error.response.status === 403) {
          console.error('Errore 403: Accesso negato a causa di restrizioni geografiche o token non valido.');
          const errorStream = {
            title: `${channel.name} (Errore: Accesso Negato)`,
            url: '',
            behaviorHints: {
              notWebReady: true,
              bingeGroup: "tv",
              errorMessage: "Accesso negato. Potrebbe essere necessario utilizzare una VPN o verificare la tua posizione."
            }
          };
          streams.push(errorStream);
        } else {
          console.error('Errore nel caricamento dello stream:', error);
        }
      }
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

// Avvia il server HTTP
serveHTTP(builder.getInterface(), { port: port });
