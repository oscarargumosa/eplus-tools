FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
# Idiomas: si falta alguna traducción al inglés, la imagen no se construye y no se despliega.
RUN node scripts/i18n-check.js
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
