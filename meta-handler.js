const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');

function normalizeChannelName(name) {
    const normalized = name
        .replace(/_/g, ' ')          // Sostituisce underscore con spazi
        .replace(/\s+/g, ' ')        // Normalizza spazi multipli
        .replace(/\./g, '')          // Rimuove i punti
        .replace(/(\d+)[\s.]*(\d+)/g, '$1$2') // Unisce i numeri (102.5 o 102 5 -> 1025)
        .trim()                      // Rimuove spazi iniziali e finali
        .toLowerCase();              // Converte in minuscolo per confronto case-insensitive
    
    return normalized;
}

async function metaHandler({ type, id }) {
    try {
        // Aggiorna la cache se necessario
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        // Estrai il nome del canale dall'ID e normalizzalo
        const channelName = id.split('|')[1].replace(/_/g, ' ');

        // Debug: stampa tutti i canali disponibili
        const allChannels = CacheManager.getCachedData().channels;

        const normalizedSearchName = normalizeChannelName(channelName);
        const channel = allChannels.find(ch => {
            const normalizedChannelName = normalizeChannelName(ch.name);
            return normalizedChannelName === normalizedSearchName;
        });

        if (!channel) {
            return { meta: null };
        }

        // Crea l'oggetto meta con informazioni dettagliate
        const meta = {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.poster,
            background: channel.background,
            logo: channel.logo,
            description: channel.description || `Canale: ${channel.name}`,
            releaseInfo: 'LIVE',
            genres: channel.genre,
            posterShape: 'square',
            website: null,
            popularity: null,
            isFree: true,
            language: 'ita',
            country: 'ITA',
            behaviorHints: {
                isLive: true,
                defaultVideoId: channel.id
            }
        };

        // Aggiungi informazioni tecniche se disponibili
        if (channel.streamInfo?.tvg) {
            if (channel.streamInfo.tvg.chno) {
                meta.description += `\n📺 Canale ${channel.streamInfo.tvg.chno}`;
            }
        }

        // Arricchisci con informazioni EPG solo se abilitata
        if (config.enableEPG) {
            const currentProgram = EPGManager.getCurrentProgram(channel.streamInfo?.tvg?.id);

            if (currentProgram) {
                meta.description = `📺 IN ONDA ORA:\n${currentProgram.title}\n\n`;
                
                if (currentProgram.description) {
                    meta.description += `${currentProgram.description}\n\n`;
                }

                // Aggiungi orario di inizio e fine
                meta.description += `🕒 ${currentProgram.start.toLocaleTimeString()} - ${currentProgram.stop.toLocaleTimeString()}\n\n`;

                // Aggiungi categoria se disponibile
                if (currentProgram.category) {
                    meta.description += `📋 Categoria: ${currentProgram.category}\n\n`;
                }

                meta.releaseInfo = `In onda: ${currentProgram.title}`;
            }
        }

        return { meta };
    } catch (error) {
        console.error('[MetaHandler] Errore nel recupero dei meta:', error);
        return { meta: null };
    }
}

module.exports = metaHandler;
