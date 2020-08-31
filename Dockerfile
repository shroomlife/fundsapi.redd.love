FROM node:latest
WORKDIR /usr/src/app
COPY . .
RUN npm install --only=production
CMD [ "node", "index" ]
