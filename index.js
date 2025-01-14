// index.js
const { addonBuilder } = require('stremio-addon-sdk');
const config = require('./config');
const { catalogHandler, streamHandler } = require('./handlers');

// Create the addon
const builder = new addonBuilder(config.manifest);

// Define routes
builder.defineStreamHandler(streamHandler);
builder.defineCatalogHandler(catalogHandler);

// Initialize the cache manager
const CacheManager = require('./cache-manager')(config);

// Update cache on startup
CacheManager.updateCache(true).catch(error => {
    console.error('Error updating cache on startup:', error);
});

// Create and start the server
const addonInterface = builder.getInterface();
const serveHTTP = require('stremio-addon-sdk/src/serveHTTP');

serveHTTP(addonInterface, { port: config.port })
    .then(({ url }) => {
        console.log('Addon active on:', url);
        console.log('Add the following URL to Stremio:', url + 'manifest.json');
    })
    .catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
