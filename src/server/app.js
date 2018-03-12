const express = require('express');
const http = require('http');
const net = require('net');
const path = require('path');
const randomstring = require('randomstring');
const ws = require('ws');

const port = process.env.PORT || 5000;
const appDirectory = path.join(__dirname, '../../public');

const app = express();

const server = http.createServer(app);

const wsServer = new ws.Server({
  server,
  path: '/mongo',
  clientTracking: true,
});

wsServer.on('connection', function (connection, req) {
  // Compatible with Meteor's "Random.id()".
  connection.id = randomstring.generate({
    length: 17,
    charset: '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz',
  });

  console.log("New connection", connection.id);

  // Configure that data is a list of fragments. No need to try to combine
  // them together because we are jut passing them on.
  connection.binaryType = 'fragments';

  // When we get pong from the client, we know that the connection is still alive.
  connection.isAlive = true;
  connection.on('pong', function () {
    connection.isAlive = true;
  });

  // TODO: Make configurable.
  const mongoConnection = net.createConnection({
    host: 'localhost',
    port: 27017,
    family: 6,
  });

  // Calls which are otherwise set by the mongo driver. On the client
  // we make them a noop and we call them ourselves here.
  mongoConnection.setKeepAlive(true, 300000);
  mongoConnection.setTimeout(30000);
  mongoConnection.setNoDelay(true);

  connection.on('close', function (code, reason) {
    console.log("Connection closed", connection.id, "code", code, "reason", reason);
    mongoConnection.end();
  });

  connection.on('error', function (error) {
    console.log("Connection error", connection.id, "error", error);
    // "close" event is automatically emitted afterwards.
  });

  connection.on('message', function (data) {
    if (mongoConnection.destroyed && !mongoConnection.writable) return;

    // Data is an array of fragments.
    data.forEach(function (fragment) {
      mongoConnection.write(fragment, function (error) {
        if (error) {
          console.log("Mongo connection write error", connection.id, "error", error);
          // This will emit an "error" event.
          mongoConnection.destroy(error);
        }
      });
    });
  });

  mongoConnection.on('data', function (data) {
    if (connection.readyState !== connection.OPEN) return;

    connection.send(data, {binary: true}, function (error) {
      if (error) {
        console.log("Connection send error", connection.id, "error", error);
        connection.terminate();
      }
    });
  });

  mongoConnection.on('close', function (had_error) {
    console.log("Mongo connection closed", connection.id);
    connection.close();
  });

  mongoConnection.on('error', function (error) {
    console.log("Mongo connection error", connection.id, "error", error);
  });

  mongoConnection.on('timeout', function () {
    console.log("Mongo connection timeout", connection.id);
    mongoConnection.destroy();
  });
});

// Check for died connections at regular intervals.
setInterval(function () {
  wsServer.clients.forEach(function (connection) {
    if (connection.isAlive === false) {
      console.log("Connection died", connection.id);
      return connection.terminate();
    }

    // Request the client to respond with pong. Client does this automatically.
    connection.isAlive = false;
    connection.ping(function () {});
  });
}, 30000); // ms

// Serve all app files which exist.
app.use(express.static(appDirectory));

// For everything else, serve "index.html".
app.get('*', function (req, res) {
  res.sendFile('index.html', {
    root: appDirectory,
  });
});

server.listen(port, function () {
  console.log("Listening", server.address());
});
