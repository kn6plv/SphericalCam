#!/usr/bin/node

const snap = require("./snap");
const server = require("./server");

snap.run();
server.run(snap.take);
