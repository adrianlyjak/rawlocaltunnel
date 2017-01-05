const net = require('net');
const log = require('loglevel')
const http = require('http');
const socketLinker = require('./socketLinker');



module.exports = function main({
    listenPort = 3000,
    logLevel = 'info'
}, next) {
  const app = new http.Server();
  log.setLevel(logLevel);

  // never hangs up
  app.on('request', function (req, res) {

    log.debug('/');

    let clientQueue = [];
    let externalQueue = [];
    let piped = [];
    const handleClient = socketLinker('client queue', clientQueue, externalQueue, piped);
    const handleExternal = socketLinker('external queue', externalQueue, clientQueue, piped);

    const externalServer = net.createServer((external) => {
      handleExternal(external);
    });
    externalServer.on('error', (ex) => log.error(ex))

    const internalServer = net.createServer((client) => {
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
    .catch(ex => log.error(ex))


    res.socket.once('close', () => {
      log.info('client http connection closed. Ending session');
      piped.forEach(x => x.forEach(y => y.end()));
      externalServer.close();
      internalServer.close();
    })


  })

  return new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(listenPort, () => {
      log.info(`api listening on ${listenPort}`);
      resolve(app);
    });
  });

}
