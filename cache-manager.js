const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.transformer = new PlaylistTransformer();
        this.cache = {
            stremioData: null,
            lastUpdated: null,
            updateInProgress: false
        };
    }

    async updateCache(force = false) {
        if (this.cache.updateInProgress) {
            console.log('Aggiornamento cache già in corso, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('Aggiornamento della cache in corso...');

            // Check if update is needed
            const needsUpdate = force || !this.cache.lastUpdated || 
                (Date.now() - this.cache.lastUpdated) > this.config.cacheSettings.updateInterval;

            if (!needsUpdate) {
                console.log('Cache ancora valida, skip aggiornamento');
                return;
            }

            // Carica e trasforma la playlist
            console.log('Caricamento playlist da:', this.config.M3U_URL);
            const stremioData = await this.transformer.loadAndTransform(this.config.M3U_URL);
            
            console.log(`Playlist trasformata: ${stremioData.channels.length} canali, ${stremioData.genres.length} generi`);

            // Aggiorna la cache
            this.cache = {
                stremioData,
                lastUpdated: Date.now(),
                updateInProgress: false
            };

            this.emit('cacheUpdated', this.cache);
            console.log('Cache aggiornata con successo');

        } catch (error) {
            console.error('Errore nell\'aggiornamento della cache:', error);
            this.cache.updateInProgress = false;
            this.emit('cacheError', error);
            throw error;
        }
    }

    getCachedData() {
        if (!this.cache.stremioData) return { channels: [], genres: [] };
        
        return {
            channels: [...this.cache.stremioData.channels],
            genres: [...this.cache.stremioData.genres]
        };
    }

    getChannel(channelName) {
        return this.cache.stremioData?.channels.find(
            channel => channel.name === channelName
        );
    }

    getChannelsByGenre(genre) {
        if (!genre) return this.cache.stremioData?.channels || [];
        return this.cache.stremioData?.channels.filter(
            channel => channel.genre.includes(genre)
        ) || [];
    }

    searchChannels(query) {
        if (!query) return this.cache.stremioData?.channels || [];
        const searchTerm = query.toLowerCase();
        return this.cache.stremioData?.channels.filter(
            channel => channel.name.toLowerCase().includes(searchTerm)
        ) || [];
    }

    isStale() {
        if (!this.cache.lastUpdated) return true;
        return (Date.now() - this.cache.lastUpdated) >= this.config.cacheSettings.updateInterval;
    }
}

module.exports = config => new CacheManager(config);
