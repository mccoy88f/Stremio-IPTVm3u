const config = {
    // Server configuration
    port: process.env.PORT || 10000,
    
    // Content sources
    M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u',
    EPG_URL: process.env.EPG_URL || null, // Sarà popolato con l'URL dalla playlist se non specificato
    
    // Feature flags
    enableEPG: process.env.ENABLE_EPG === 'yes',
    
    // Proxy configuration
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    FORCE_PROXY: process.env.FORCE_PROXY === 'yes', // Nuova configurazione
    
    // Cache settings
    cacheSettings: {
        updateInterval: 12 * 60 * 60 * 1000,
        maxAge: 24 * 60 * 60 * 1000,
        retryAttempts: 3,
        retryDelay: 5000
    },
    
    // EPG settings
    epgSettings: {
        maxProgramsPerChannel: 50,
        updateInterval: 12 * 60 * 60 * 1000,
        cacheExpiry: 24 * 60 * 60 * 1000
    },
    
    // Manifest configuration
    manifest: {
        id: 'org.mccoy88f.iptvaddon',
        version: '1.2.0',
        name: 'IPTV Italia Addon',
        description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
        logo: 'https://github.com/mccoy88f/Stremio-IPTVm3u/blob/main/tv.png?raw=true',
        resources: ['stream', 'catalog', 'meta'],
        types: ['tv'],
        idPrefixes: ['tv'],
        catalogs: [
            {
                type: 'tv',
                id: 'iptv_category',
                name: 'IPTV Italia',
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: [] // Lasciamo vuoto l'array dei generi
                    },
                    {
                        name: 'search',
                        isRequired: false
                    },
                    {
                        name: 'skip',
                        isRequired: false
                    }
                ]
            }
        ]
    }
};

// Funzione per aggiornare l'URL dell'EPG
config.updateEPGUrl = function(url) {
    if (!this.EPG_URL && url) {  // Aggiorna solo se non è già impostato tramite variabili d'ambiente
        this.EPG_URL = url;
    }
};

module.exports = config;
