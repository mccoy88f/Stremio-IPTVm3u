const EventEmitter = require('events');
const PlaylistTransformer = require('./playlist-transformer');

function normalizeChannelName(name) {
    const normalized = name
        .replace(/_/g, ' ')          // Sostituisce underscore con spazi
        .replace(/\s+/g, ' ')        // Normalizza spazi multipli
        .replace(/\./g, '')          // Rimuove i punti
        .replace(/(\d+)[\s.]*(\d+)/g, '$1$2') // Unisce i numeri (102.5 o 102 5 -> 1025)
        .trim()                      // Rimuove spazi iniziali e finali
        .toLowerCase();              // Converte in minuscolo per confronto case-insensitive
    
    console.log(`[CacheManager] Normalizzazione nome canale: "${name}" -> "${normalized}"`);
    return normalized;
}

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
            console.log('⚠️  Aggiornamento cache già in corso, skip...');
            return;
        }

        try {
            this.cache.updateInProgress = true;
            console.log('\n=== Inizio Aggiornamento Cache ===');

            const needsUpdate = force || !this.cache.lastUpdated || 
                (Date.now() - this.cache.lastUpdated) > this.config.cacheSettings.updateInterval;

            if (!needsUpdate) {
                console.log('ℹ️  Cache ancora valida, skip aggiornamento');
                return;
            }

            // Carica e trasforma la playlist
            console.log('Caricamento playlist da:', this.config.M3U_URL);
            const stremioData = await this.transformer.loadAndTransform(this.config.M3U_URL);
            
            // Aggiorna la cache
            this.cache = {
                stremioData,
                lastUpdated: Date.now(),
                updateInProgress: false
            };

            // Aggiorna i generi nel manifest
            this.config.manifest.catalogs[0].extra[0].options = stremioData.genres;

            console.log('\nRiepilogo Cache:');
            console.log(`✓ Canali in cache: ${stremioData.channels.length}`);
            console.log(`✓ Generi trovati: ${stremioData.genres.length}`);
            console.log(`✓ Lista generi: ${stremioData.genres.join(', ')}`);
            console.log('✓ Lista canali:');
            stremioData.channels.forEach(channel => {
                console.log(`  - "${channel.name}" -> "${normalizeChannelName(channel.name)}"`);
            });
            console.log(`✓ Ultimo aggiornamento: ${new Date().toLocaleString()}`);
            console.log('\n=== Cache Aggiornata con Successo ===\n');

            this.emit('cacheUpdated', this.cache);

        } catch (error) {
            console.error('\n❌ ERRORE nell\'aggiornamento della cache:', error);
            this.cache.updateInProgress = false;
            this.emit('cacheError', error);
            throw error;
        }
    }

    getCachedData() {
        if (!this.cache.stremioData) return { channels: [], genres: [] };
        
        return {
            channels: this.cache.stremioData.channels,
            genres: this.cache.stremioData.genres
        };
    }

    getChannel(channelName) {
        const normalizedSearchName = normalizeChannelName(channelName);
        const channel = this.cache.stremioData?.channels.find(ch => {
            const normalizedChannelName = normalizeChannelName(ch.name);
            console.log(`[CacheManager] Confronto: "${normalizedChannelName}" con "${normalizedSearchName}"`);
            return normalizedChannelName === normalizedSearchName;
        });

        if (!channel) {
            console.log(`[CacheManager] Canale non trovato: "${channelName}" (normalizzato: "${normalizedSearchName}")`);
        } else {
            console.log(`[CacheManager] Canale trovato: "${channel.name}"`);
        }

        return channel;
    }

    getChannelsByGenre(genre) {
        if (!genre) return this.cache.stremioData?.channels || [];
        return this.cache.stremioData?.channels.filter(
            channel => channel.genre?.includes(genre)
        ) || [];
    }

    searchChannels(query) {
        if (!query) return this.cache.stremioData?.channels || [];
        const searchTerm = normalizeChannelName(query);
        return this.cache.stremioData?.channels.filter(channel => {
            const normalizedName = normalizeChannelName(channel.name);
            return normalizedName.includes(searchTerm);
        }) || [];
    }

    isStale() {
        if (!this.cache.lastUpdated) return true;
        return (Date.now() - this.cache.lastUpdated) >= this.config.cacheSettings.updateInterval;
    }
}

module.exports = config => new CacheManager(config);
