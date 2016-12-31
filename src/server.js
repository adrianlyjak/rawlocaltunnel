const net = require('net');
const express = require('express');
const log = require('loglevel')

const app = express();
log.setLevel('debug');


function linkSocketsWhileOpen(a, b) {
  const handleA = (data) => b.write(data);
  const handleB = (data) => a.write(data);
  a.on('data', handleA);
  b.on('data', handleB);
  const off = () => {
    a.removeListener('data', handleA)
    b.removeListener('data', handleB)
  }
  a.once('close', () => off());
  b.once('close', () => off());
}

// never hangs up
app.get('/', function (req, res) {

  let clientConnections = [];
  let externalConnections = [];

  const externalServer = net.createServer((external) => {
    log.debug('external connected');
    clientConnections.forEach(client => {
      linkSocketsWhileOpen(client, external)
    });
    externalConnections.push(external);
    external.once('close', (x) => {
      log.debug('external disconnected', x);
      externalConnections = externalConnections.filter(x => x !== external);
    })
  })

  const internalServer = net.createServer((client) => {
    log.debug('client connected');
    client.on('error', (e) => log.error('internalConnection error', e));
    externalConnections.forEach(external => {
      linkSocketsWhileOpen(external, client);
    })
    clientConnections.push(client);
    client.once('close', (x) => {
      log.debug('client disconnected', x);
      clientConnections = clientConnections.filter(x => x !== client);
    })
  });


  const externalPort = new Promise((resolve, _) =>
    externalServer.listen(() => resolve())
  ).then(x => externalServer.address().port)

  const internalPort = new Promise((resolve, _) =>
    internalServer.listen(() => resolve())
  ).then(x => internalServer.address().port)

  Promise.all([externalPort, internalPort]).then(([externalPort, internalPort]) => {
    log.info('listening on ', { externalPort, internalPort });
    res.write(JSON.stringify({ externalPort, internalPort }) + "\r\n");
  })
  .catch(ex => console.error(ex))


  res.socket.once('close', () => {
    log.info('client http connection closed. Ending session');
    externalServer.close();
    internalServer.close();
  })

})

const listenPort = 3000;
app.listen(listenPort)
console.log(`api listening on ${listenPort}`)




/*
client
  requests forward providing { port }
server
  allocates 2 ports to listen, one for outward incoming communication, one for the client to connect to
  response { externalPort, comPort }
client
  connects to comPort
*/
