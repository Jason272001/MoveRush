FROM node:lts-alpine
WORKDIR /app
COPY pack.html pack.css pack.js pack-room.js server.cjs core.js rooms.js motion.js avatars.js peer-rooms.js scenery.js game.js index.html style.css ./
COPY vendor ./vendor
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.cjs"]
