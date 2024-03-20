#!/usr/bin/env node

/**
 * Module dependencies.
 */

import app from "../app";
import debugModule from "debug";
import http from "http";

const debug = debugModule("express:server");

/**
 * Normalize a port into a number, string, or false.
 */

const normalizePort = (val: string | number): number | string | boolean => {
  const port = parseInt(val.toString(), 10);

  if (Number.isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
};

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Event listener for HTTP server "error" event.
 */

const onError = (error: NodeJS.ErrnoException): void => {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? `Pipe ${port}` : `Port ${port}`;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
};

/**
 * Event listener for HTTP server "listening" event.
 */

const onListening = (): void => {
  const addr = server.address();
  const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;

  console.log(`STAGE: ${process.env.STAGE}`);
  console.log(`HOST: ${process.env.HOST}`);
  console.log(`PORT: ${process.env.PORT}`);
  console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN}`);
  console.log(`NOTI_SLACK_URL: ${process.env.NOTI_SLACK_URL}`);
  console.log(`Listening on ${bind}`);
};

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);
