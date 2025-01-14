const axios = require('axios');

class PlaylistTransformer {
    constructor() {
        this.stremioData = {
            genres: new Set(),
            channels: []
        };
    }

    /**
     * Estrae gli headers dalle opzioni VLC
     */
    parseVLCOpts(lines, currentIndex) {
        const headers = {};
        let i = currentIndex;
        
        while (i < lines.length && lines[i].startsWith('#EXTVLCOPT:')) {
            const opt = lines[i].substring('#EXTVLCOPT:'.length).trim();
            if (opt.startsWith('http-user-agent=')) {
                headers['User-Agent'] = opt.substring('http-user-agent='.length);
            }
            // Qui possiamo aggiungere altri headers se necessario
            i++;
        }
        
        return { headers, nextIndex: i };
    }

    /**
     * Converte un canale nel formato Stremio
     */
    transformChannelToStremio(channel) {
        const id = `tv|${channel.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Aggiungi il genere alla lista dei generi
        if (channel.group) {
            this.stremioData.genres.add(channel.group);
        }

        return {
            id,
            type: 'tv',
            name: channel.name,
            genre: channel.group ? [channel.group] : [],
            posterShape: 'square',
            poster: channel.tvg?.logo,
            background: channel.tvg?.logo,
            logo: channel.tvg?.logo,
            description: `Canale: ${channel.name}`,
            runtime: 'LIVE',
            behaviorHints: {
                defaultVideoId: id,
                isLive: true
            },
            // Manteniamo i dati originali per lo streaming
            streamInfo: {
                url: channel.url,
                headers: channel.headers, // Headers dinamici dalla playlist
                tvg: channel.tvg || {}
            }
        };
    }

    /**
     * Parsa una playlist M3U
     */
    parseM3U(content) {
        const lines = content.split('\n');
        let currentChannel = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
                // Estrai i metadati del canale
                const metadata = line.substring(8).trim();
                const tvgData = {};
                
                // Estrai attributi tvg
                const tvgMatches = metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || [];
                tvgMatches.forEach(match => {
                    const [key, value] = match.split('=');
                    const cleanKey = key.replace('tvg-', '');
                    tvgData[cleanKey] = value.replace(/"/g, '');
                });

                // Estrai il gruppo
                const groupMatch = metadata.match(/group-title="([^"]+)"/);
                const group = groupMatch ? groupMatch[1] : 'Altri';

                // Estrai il nome del canale
                const nameParts = metadata.split(',');
                const name = nameParts[nameParts.length - 1].trim();

                // Controlla se ci sono opzioni VLC nelle righe successive
                const { headers, nextIndex } = this.parseVLCOpts(lines, i + 1);
                i = nextIndex - 1; // Aggiorna l'indice del ciclo

                currentChannel = {
                    name,
                    group,
                    tvg: tvgData,
                    headers: headers // Headers dinamici
                };
            } else if (line.startsWith('http')) {
                if (currentChannel) {
                    currentChannel.url = line;
                    this.stremioData.channels.push(
                        this.transformChannelToStremio(currentChannel)
                    );
                    currentChannel = null;
                }
            }
        }

        return {
            genres: Array.from(this.stremioData.genres),
            channels: this.stremioData.channels
        };
    }

    /**
     * Carica e trasforma una playlist da URL
     */
    async loadAndTransform(url) {
        try {
            const response = await axios.get(url);
            return this.parseM3U(response.data);
        } catch (error) {
            console.error('Errore nel caricamento della playlist:', error);
            throw error;
        }
    }
}

module.exports = PlaylistTransformer;