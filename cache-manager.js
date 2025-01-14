const EventEmitter = require('events');
const { parsePlaylist } = require('./parser');
const EPGManager = require('./epg-manager');

class CacheManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.cache = {
            m3u: null,
            genres: [],
            lastUpdated: null,
            updateInProgress: false
        };
        
        // Bindare i metodi
        this.updateCache = this.updateCache.bind(this);
        this.getCachedData = this.getCachedData.bind(this);
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
                (Date.now() - this.cache.lastUpdated) > 12 * 60 * 60 * 1000; // 12 hours

            if (!needsUpdate) {
                console.log('Cache ancora valida, skip aggiornamento');
                return;
            }

            // Update M3U data
            const { items, groups } = await parsePlaylist(this.config.M3U_URL);
            console.log('Playlist M3U caricata:', items.length, 'canali');

            // Update EPG if enabled
            if (this.config.enableEPG && EPGManager.needsUpdate()) {
                console.log('Aggiornamento EPG...');
                await EPGManager.parseEPG(this.config.EPG_URL);
            }

            // Update cache
            this.cache = {
                m3u: items,
                genres: groups,
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
        // Return a deep copy to prevent modifications
        return {
            m3u: this.cache.m3u ? [...this.cache.m3u] : null,
            genres: [...this.cache.genres],
            lastUpdated: this.cache.lastUpdated,
            epg: EPGManager
        };
    }

    getChannel(channelName) {
        return this.cache.m3u?.find(item => item.name === channelName) || null;
    }

    getChannelsByGenre(genre) {
        if (!genre) return this.cache.m3u || [];
        return this.cache.m3u?.filter(item => item.genres.includes(genre)) || [];
    }

    searchChannels(query) {
        if (!query) return this.cache.m3u || [];
        const searchTerm = query.toLowerCase();
        return this.cache.m3u?.filter(item => 
            item.name.toLowerCase().includes(searchTerm)
        ) || [];
    }

    isStale() {
        if (!this.cache.lastUpdated) return true;
        const hours = (Date.now() - this.cache.lastUpdated) / (1000 * 60 * 60);
        return hours >= 12; // Consider cache stale after 12 hours
    }
}

module.exports = config => new CacheManager(config);
