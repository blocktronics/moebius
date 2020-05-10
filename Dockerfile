FROM node:10-alpine
LABEL author="L23MN"

ARG UID=1000
ARG GID=1000

ENV LANG C.UTF-8
ENV USER ascii
ENV HOME /app

COPY . /app
WORKDIR /app

RUN deluser --remove-home node \
    && addgroup -S $USER -g $GID \
    && adduser -S -G $USER -u $UID -h $HOME $USER \
    && touch server.ans \
    && npm install

USER $USER
EXPOSE 8000
