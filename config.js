// Configurazioni dell'addon
module.exports = {
    port: process.env.PORT || 10000,
    M3U_URL: process.env.M3U_URL || 'https://raw.githubusercontent.com/Tundrak/IPTV-Italia/refs/heads/main/iptvitaplus.m3u',
    EPG_URL: 'https://www.epgitalia.tv/gzip',
    enableEPG: process.env.ENABLE_EPG === 'yes',
    PROXY_URL: process.env.PROXY_URL || null,
    PROXY_PASSWORD: process.env.PROXY_PASSWORD || null,

    // Configurazioni del manifest
    manifest: {
        id: 'org.mccoy88f.iptvaddon',
        version: '1.1.0',
        name: 'IPTV Italia Addon',
        description: 'Un add-on per Stremio che carica una playlist M3U di IPTV Italia con EPG.',
        logo: 'https://github.com/mccoy88f/Stremio-IPTVm3u/blob/main/tv.png?raw=true',
        resources: ['stream', 'catalog'],
        types: ['tv'],
        idPrefixes: ['tv']
    }
};
