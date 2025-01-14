const config = require('./config');
const CacheManager = require('./cache-manager')(config);
const EPGManager = require('./epg-manager');

/**
 * Arricchisce i metadati del canale con informazioni EPG dettagliate
 */
function enrichWithDetailedEPG(meta, channelId) {
    if (!config.enableEPG) return meta;

    const currentProgram = EPGManager.getCurrentProgram(channelId);
    const upcomingPrograms = EPGManager.getUpcomingPrograms(channelId, 10);

    if (currentProgram) {
        // Aggiorna la descrizione con informazioni dettagliate sul programma corrente
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

    // Aggiungi la programmazione futura
    if (upcomingPrograms && upcomingPrograms.length > 0) {
        meta.description += '📅 PROSSIMI PROGRAMMI:\n\n';
        upcomingPrograms.forEach(program => {
            meta.description += `• ${program.start.toLocaleTimeString()} - ${program.title}\n`;
            if (program.description) {
                meta.description += `  ${program.description.substring(0, 100)}${program.description.length > 100 ? '...' : ''}\n`;
            }
        });
    }

    return meta;
}

/**
 * Handler per i metadati dettagliati di un canale
 */
async function metaHandler({ type, id }) {
    try {
        // Aggiorna la cache se necessario
        if (CacheManager.isStale()) {
            await CacheManager.updateCache();
        }

        // Estrai il nome del canale dall'ID
        const channelName = id.split('|')[1].replace(/_/g, ' ');
        const channel = CacheManager.getChannel(channelName);

        if (!channel) {
            console.log('Canale non trovato nei meta:', channelName);
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
            description: channel.description || '',
            releaseInfo: 'LIVE',
            runtime: 'LIVE',
            genres: channel.genre,
            posterShape: 'square',
            background: channel.background,
            logo: channel.logo,
            website: null,
            populatity: null,
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

        // Arricchisci con informazioni EPG dettagliate
        const enrichedMeta = enrichWithDetailedEPG(meta, channel.streamInfo?.tvg?.id);

        return { meta: enrichedMeta };
    } catch (error) {
        console.error('Errore nel recupero dei meta:', error);
        return { meta: null };
    }
}

module.exports = metaHandler;
