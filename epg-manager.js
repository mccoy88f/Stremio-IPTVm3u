const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

class EPGManager {
    constructor() {
        this.epgData = null;
        this.programGuide = new Map();
        this.lastUpdate = null;
    }

    async parseEPG(url) {
        try {
            console.log('Scaricamento EPG da:', url);
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const decompressed = await gunzip(response.data);
            const xmlData = decompressed.toString();
            
            const parsed = await parseStringPromise(xmlData);
            await this.processEPGData(parsed);
            
            this.lastUpdate = Date.now();
            console.log('EPG aggiornato con successo');
            
            return this.programGuide;
        } catch (error) {
            console.error('Errore nel parsing EPG:', error);
            throw error;
        }
    }

    async processEPGData(data) {
        try {
            const programmes = data.tv.programme || [];
            const channels = data.tv.channel || [];
            
            // Reset program guide
            this.programGuide.clear();

            // Process channels
            for (const channel of channels) {
                const channelId = channel.$.id;
                const channelData = {
                    id: channelId,
                    name: channel['display-name']?.[0]?.$?.text || channelId,
                    icon: channel.icon?.[0]?.$.src,
                    programs: []
                };
                this.programGuide.set(channelId, channelData);
            }

            // Process programs
            for (const program of programmes) {
                const channelId = program.$.channel;
                const channelData = this.programGuide.get(channelId);
                
                if (channelData) {
                    const programData = {
                        start: new Date(program.$.start),
                        stop: new Date(program.$.stop),
                        title: program.title?.[0]?.$?.text || 'Programma senza titolo',
                        description: program.desc?.[0]?.$?.text || '',
                        category: program.category?.[0]?.$?.text || '',
                        rating: program.rating?.[0]?.value?.[0] || ''
                    };
                    
                    channelData.programs.push(programData);
                }
            }

            // Sort programs by start time
            for (const channelData of this.programGuide.values()) {
                channelData.programs.sort((a, b) => a.start - b.start);
            }

        } catch (error) {
            console.error('Errore nel processamento EPG:', error);
            throw error;
        }
    }

    getCurrentProgram(channelId) {
        const channel = this.programGuide.get(channelId);
        if (!channel) return null;

        const now = new Date();
        return channel.programs.find(program => 
            program.start <= now && program.stop >= now
        );
    }

    getUpcomingPrograms(channelId, limit = 5) {
        const channel = this.programGuide.get(channelId);
        if (!channel) return [];

        const now = new Date();
        return channel.programs
            .filter(program => program.start >= now)
            .slice(0, limit);
    }

    needsUpdate() {
        if (!this.lastUpdate) return true;
        const hoursSinceUpdate = (Date.now() - this.lastUpdate) / (1000 * 60 * 60);
        return hoursSinceUpdate >= 24;
    }
}

module.exports = new EPGManager();
