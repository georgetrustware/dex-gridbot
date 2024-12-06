FROM node:18
WORKDIR /home/app/node-app
COPY . .
COPY .env .
COPY .bashrc /root
RUN npm install pm2 -g
RUN npm install
RUN apt-get update && apt-get -y --no-install-recommends install nano
ENTRYPOINT ["./docker-entrypoint.sh"]
