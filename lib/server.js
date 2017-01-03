const net = require('net');
const express = require('express');
const log = require('loglevel')

function socketLinker(myQueue, theirQueue, piped) {

  function link(mySocket, theirSocket) {
    function both(functionOfAAndB) {
      functionOfAAndB(mySocket, theirSocket);
      functionOfAAndB(theirSocket, mySocket);
    }

    const pair = [mySocket, theirSocket]

    let uninitialized = false;
    function uninitialize() {
      if (!uninitialized) {
        log.debug('removing connection pair')
        pair.forEach(x => x.end());
        const idx = piped.indexOf(pair);
        piped.splice(idx, 1);
        uninitialized = true;
      }
    }

    piped.push(pair);

    both((a, b) => a.on('data', (data) => {
      log.info('data', data);
      b.write(data)
    }));
    both((a, b) => a.on('close', () => {
      uninitialize();
    }));
    both((a, b) => a.on('error', (ex) => {
      log.error('socket errored', ex);
      uninitialize();
    }));


  }

  function queue(socket) {
    const bufferWrapper = {
      socket,
      bufferData: [],
      onData: (data) => {
        bufferWrapper.bufferData.push(data);
      },
      init() {
        bufferWrapper.socket.on('data', bufferWrapper.onData);
        bufferWrapper.socket.on('close', bufferWrapper.removeFromQueue);
        bufferWrapper.socket.on('error', bufferWrapper.removeFromQueue);
        myQueue.push(bufferWrapper)
      },
      removeFromQueue: () => {
        const idx = myQueue.indexOf(bufferWrapper);
        myQueue.splice(idx, 1);
        bufferWrapper.socket.removeListener('data', bufferWrapper.onData);
        bufferWrapper.socket.removeListener('error', bufferWrapper.removeFromQueue);
        bufferWrapper.socket.removeListener('close', bufferWrapper.removeFromQueue);
      },
      linkTo: (other) => {
        const linked = link(bufferWrapper.socket, other);
        bufferWrapper.bufferData.forEach(x => other.write(x));
        bufferWrapper.removeFromQueue();
        bufferWrapper.bufferData = [];
        return linked;
      }
    }
    bufferWrapper.init()



  }

  return (newSocket) => {
    log.debug('handling new socket');
    if (theirQueue.length === 0) {
      log.debug('queueing new socket for later');
      queue(newSocket);
    } else {
      log.debug('pairing new socket with queued socket');
      theirQueue.shift().linkTo(newSocket);
    }
  }
}

const pipeSocketsTogether = require('./pipeSocketsTogether')

module.exports = function main({
    listenPort = 3000,
    logLevel = 'info'
}) {
  const app = express();
  log.setLevel(logLevel);





  // never hangs up
  app.get('/', function (req, res) {


    log.debug('/');

    let clientQueue = [];
    let externalQueue = [];
    let piped = [];
    const handleClient = socketLinker(clientQueue, externalQueue, piped);
    const handleExternal = socketLinker(externalQueue, clientQueue, piped);

    const externalServer = net.createServer((external) => {
      log.debug('external connected');
      handleExternal(external);
    });
    externalServer.on('error', (ex) => log.error(ex))

    const internalServer = net.createServer((client) => {
      log.debug('client connected');
      handleClient(client);
    });
    internalServer.on('error', (ex) => log.error(ex))

    const externalPort = new Promise((resolve, _) =>
      externalServer.listen(() => resolve())
    ).then(x => externalServer.address().port)

    const internalPort = new Promise((resolve, _) =>
      internalServer.listen(() => resolve())
    ).then(x => internalServer.address().port)

    Promise.all([externalPort, internalPort]).then(([externalPort, internalPort]) => {
      log.info('listening on ', { externalPort, internalPort });
      res.setTimeout(0)
      res.write(JSON.stringify({ externalPort, internalPort }) + '\r\n');
    })
    .catch(ex => console.error(ex))


    res.socket.once('close', () => {
      log.info('client http connection closed. Ending session');
      piped.forEach(x => x.forEach(y => y.end()));
      externalServer.close();
      internalServer.close();
    })

  })


  app.listen(listenPort)
  log.info(`api listening on ${listenPort}`)




  /*
  client
    requests forward providing { port }
  server
    allocates 2 ports to listen, one for outward incoming communication, one for the client to connect to
    response { externalPort, comPort }
  client
    connects to comPort
  */

}
