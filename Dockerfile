# Usa un'immagine Node.js come base
FROM node:16

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file del progetto
COPY package.json package-lock.json ./
RUN npm install

# Copia il resto del codice
COPY . .

# Esponi la porta 7000 (usata da Stremio)
EXPOSE 7000

# Avvia l'add-on
CMD ["node", "index.js"]
