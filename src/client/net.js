module.exports = {
  createConnection(options) {
    if (options.port !== 27017 || options.host !== 'localhost') {
      throw new Error(`Could not connect to '${options.host}:${options.port}'.`)
    }

    // TODO: Use origin to determine "ws" vs. "wss" and hostname and port.
    const connection = new WebSocket('ws://localhost:5000/mongo');

    connection.binaryType = 'arraybuffer';

    // We use a proxy to find out if our shim implementation is lacking.
    const socket = new Proxy({
      destroyed: false,

      writable: true,

      setKeepAlive(enable, initialDelay) {
        // A noop. Called with enable=true and initialDelay=300000.
      },

      setTimeout(timeout) {
        // A noop. Called with timeout=30000.
      },

      setNoDelay(noDelay) {
        // A noop. Called with noDelay=true.
      },

      once(eventName, listener) {
        if (eventName === 'connect') {
          connection.addEventListener('open', function (event) {
            listener();
          }, {once: true});
        }
        else if (eventName === 'error') {
          connection.addEventListener('error', function (event) {
            listener();
          }, {once: true});
        }
        else if (eventName === 'close') {
          connection.addEventListener('close', function (event) {
            listener(!event.wasClean);
          }, {once: true});
        }
        else if (eventName === 'timeout') {
          // A noop.
        }
        else {
          throw Error(`Unsupported event name '${eventName}'.`);
        }
      },

      on(eventName, listener) {
        if (eventName === 'data') {
          connection.addEventListener('message', function (event) {
            listener(new Buffer(event.data));
          });
        }
        else {
          throw Error(`Unsupported event name '${eventName}'.`);
        }
      },

      end() {
        connection.close();
        this.destroyed = true;
      },

      destroy(exception) {
        if (exception) {
          connection.close(1006, exception.toString());
        }
        else {
          connection.close();
        }
        this.destroyed = true;
      },

      write(data) {
        connection.send(data);
      },
    }, {
      get: function (target, name) {
        if (!(name in target)) {
          console.log("Accessing non-existent property", name);
        }

        return target[name];
      },
    });

    connection.addEventListener('close', function (event) {
      socket.destroyed = true;
    }, {once: true});

    return socket;
  }
};
