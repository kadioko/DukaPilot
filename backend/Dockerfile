FROM node:24-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY prisma.config.js ./
RUN npx prisma generate
COPY . .
EXPOSE 4000
CMD ["node", "src/app.js"]
