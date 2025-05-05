FROM node:18


WORKDIR /my-expenses-bot

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"]
