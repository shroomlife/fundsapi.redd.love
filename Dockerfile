FROM node:16-stretch
WORKDIR /usr/src/app
COPY . .
RUN npm install --only=production
CMD [ "node", "index" ]
