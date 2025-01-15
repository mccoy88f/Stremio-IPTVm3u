const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const cron = require('node-cron');

class EPGManager {
    constructor() {
        this.epgData = null;
        this.programGuide = new Map();
        this.lastUpdate = null;
        this.isUpdating = false;
        this.CHUNK_SIZE = 10000;
        this.CHUNK_DELAY = 60000; // 1 minuto
    }

    async initializeEPG(url) {
        // Questo metodo viene chiamato dopo l'avvio dell'addon
        console.log('Inizializzazione EPG pianificata...');
        
        // Pianifica l'aggiornamento alle 3 del mattino
        cron.schedule('0 3 * * *', () => {
            console.log('Avvio aggiornamento EPG pianificato');
            this.startEPGUpdate(url);
        });

        // Avvia il primo aggiornamento dopo 1 minuto dall'avvio
        setTimeout(() => {
            this.startEPGUpdate(url);
        }, 60 * 1000); // Cambiato da 5 minuti a 1 minuto
    }

    async startEPGUpdate(url) {
        if (this.isUpdating) {
            console.log('Aggiornamento EPG già in corso, skip...');
            return;
        }

        try {
            this.isUpdating = true;
            console.log('Scaricamento EPG da:', url);
            
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            let xmlString;

            // Prova a decomprimere come gzip
            try {
                const decompressed = await gunzip(response.data);
                xmlString = decompressed.toString();
            } catch (gzipError) {
                // Se fallisce, assume che sia già un XML non compresso
                console.log('File non compresso in gzip, processamento diretto...');
                xmlString = response.data.toString();
            }

            // Parsa l'XML
            const xmlData = await parseStringPromise(xmlString);
            
            // Reset della guida programmi
            this.programGuide.clear();
            
            // Avvia il processamento progressivo
            await this.processEPGInChunks(xmlData);
            
        } catch (error) {
            console.error('Errore nell\'aggiornamento EPG:', error);
            this.isUpdating = false;
        }
    }

    async processEPGInChunks(data) {
        if (!data.tv || !data.tv.programme) {
            console.log('Nessun dato EPG trovato');
            this.isUpdating = false;
            return;
        }

        const programmes = data.tv.programme;
        const totalChunks = Math.ceil(programmes.length / this.CHUNK_SIZE);
        
        console.log(`Inizio processamento EPG: ${programmes.length} programmi totali`);
        console.log(`Processamento in ${totalChunks} chunks di ${this.CHUNK_SIZE} programmi`);

        for (let i = 0; i < programmes.length; i += this.CHUNK_SIZE) {
            const chunk = programmes.slice(i, i + this.CHUNK_SIZE);
            const chunkNumber = Math.floor(i / this.CHUNK_SIZE) + 1;
            
            console.log(`Processamento chunk ${chunkNumber}/${totalChunks}...`);
            
            for (const programme of chunk) {
                const channelId = programme.$.channel;
                if (!this.programGuide.has(channelId)) {
                    this.programGuide.set(channelId, []);
                }

                const programData = {
                    start: new Date(programme.$.start),
                    stop: new Date(programme.$.stop),
                    title: programme.title?.[0]?.$?.text || programme.title?.[0] || 'Nessun titolo',
                    description: programme.desc?.[0]?.$?.text || programme.desc?.[0] || '',
                    category: programme.category?.[0]?.$?.text || programme.category?.[0] || ''
                };

                this.programGuide.get(channelId).push(programData);
            }

            // Attendi prima del prossimo chunk
            await new Promise(resolve => setTimeout(resolve, this.CHUNK_DELAY));
            console.log(`Completato chunk ${chunkNumber}/${totalChunks}`);
        }

        // Ordina i programmi per ogni canale
        for (const programs of this.programGuide.values()) {
            programs.sort((a, b) => a.start - b.start);
        }

        this.lastUpdate = Date.now();
        this.isUpdating = false;
        console.log('Aggiornamento EPG completato con successo');
    }

    getCurrentProgram(channelId) {
        const channel = this.programGuide.get(channelId);
        if (!channel) {
            // console.log(`Nessun dato EPG per il canale: ${channelId}`);
            return null;
        }

        const now = new Date();
        const currentProgram = channel.find(program => 
            program.start <= now && program.stop >= now
        );

        if (!currentProgram) {
            // console.log(`Nessun programma corrente per il canale: ${channelId}`);
            return null;
        }

        return currentProgram;
    }

    getUpcomingPrograms(channelId, limit = 5) {
        const channel = this.programGuide.get(channelId);
        if (!channel) {
            // console.log(`Nessun dato EPG per il canale: ${channelId}`);
            return [];
        }

        const now = new Date();
        const upcomingPrograms = channel
            .filter(program => program.start >= now)
            .slice(0, limit);

        return upcomingPrograms;
    }

    needsUpdate() {
        if (!this.lastUpdate) return true;
        // Controlla se sono passate più di 24 ore dall'ultimo aggiornamento
        const hoursSinceUpdate = (Date.now() - this.lastUpdate) / (1000 * 60 * 60);
        return hoursSinceUpdate >= 24;
    }

    isEPGAvailable() {
        return this.programGuide.size > 0 && !this.isUpdating;
    }

    getStatus() {
        return {
            isUpdating: this.isUpdating,
            lastUpdate: this.lastUpdate ? new Date(this.lastUpdate).toLocaleString() : 'Mai',
            channelsCount: this.programGuide.size,
            programsCount: Array.from(this.programGuide.values()).reduce((acc, progs) => acc + progs.length, 0)
        };
    }
}

module.exports = new EPGManager();
