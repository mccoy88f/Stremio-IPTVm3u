module.exports = {
    // Server configuration
    port: process.env.PORT || 10000,
    
    // Content sources
    M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u',
    EPG_URL: 'https://www.epgitalia.tv/gzip',
    
    // Feature flags
    enableEPG: process.env.ENABLE_EPG === 'yes',
    
    // Proxy configuration
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,
    
    // Cache settings
    cacheSettings: {
        updateInterval: 12 * 60 * 60 * 1000, // 12 hours in milliseconds
        maxAge: 24 * 60 * 60 * 1000,        // 24 hours in milliseconds
        retryAttempts: 3,
        retryDelay: 5000                    // 5 seconds
    },
    
    // EPG settings
    epgSettings: {
        maxProgramsPerChannel: 50,
        updateInterval: 12 * 60 * 60 * 1000, // 12 hours
        cacheExpiry: 24 * 60 * 60 * 1000     // 24 hours
    },
    
    // Manifest configuration
    manifest: {
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
                id: 'iptv_channels',
                name: 'IPTV Italia',
                extra: [
                    {
                        name: 'search',
                        isRequired: false
                    },
                    {
                        name: 'genre',
                        isRequired: false
                    }
                ]
            }
        ]
    }
};
