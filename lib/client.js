const net = require('net');
const http = require('http');
const log = require('loglevel');
const pipeSocketsTogether = require('./pipeSocketsTogether');



module.exports = function main({
  logLevel = 'error',
  remoteHostname = 'localhost',
  remoteApiPort = 3000,
  localPort,
  localHostname = 'localhost',
}) {
  log.setLevel(logLevel);

  if (!localPort) throw new Error('no local port specified');

  startupRemotePorts({
    remoteHostname,
    remoteApiPort,
  }).then(
    ({ externalPort, internalPort }) => {

    console.log(`${remoteHostname} ${externalPort}`)
    return formTunnel({
      localPort, localHostname, remoteHostname,
      remotePort: internalPort
    })

  }).then(() => {

    log.info('local tunnel connected')

  })
}



function startupRemotePorts({ remoteHostname, remoteApiPort }) {
  return new Promise((ok, nope) => {
    const req = http.request({
      method: 'GET',
      path: '/',
      protocol: 'http:',
      hostname: remoteHostname,
      port: remoteApiPort
    }, (res) => {
      res.setEncoding('utf8');
      res.once('data', (data) => ok(JSON.parse(data)))
      // keep the response open indefinitely.
      // Server only keeps ports open as long as this is open
    });
    req.on('error', (e) => nope(e))
    req.end()
  });

}


function formTunnel({ localPort, localHostname, remoteHostname, remotePort }) {
  return new Promise((resolve, reject) => {
    const remote = net.connect({
      port: remotePort,
      host: remoteHostname
    }, () => {
      log.info('connected to remote')
      resolve(remote)
    })

    remote.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        var e = new Error('connection refused: ' + remoteHostname + ':' + remotePort + ' (check your firewall settings)');
        log.error('cannot connect to server', e)
        throw e;
      }

      remote.end();
    });


  }).then((remote) => {
    retryLocal({ localPort, localHostname, remote })
  })
}

function retryLocal(opts) {
  const { localPort, localHostname, remote } = opts

  return new Promise((resolve, reject) => {
    if (remote.destroyed) {
      log.debug('remote destroyed');
      reject(new Error('remote dead'))
      return;
    }

    remote.pause();

    function retry() {
      setTimeout(() => retryLocal(opts), 500)
    }

    const client = net.connect({
      port: localPort,
      host: localHostname
    }, (connected) => {
      resolve(connected);
      remote.resume();
      pipeSocketsTogether(client, remote);
      client.on('close', retry)
    })

    client.once('error', (err) => {
      log.debug('local error', err.message);

      if (err.code !== 'ECONNREFUSED') {
        remote.end();
      } else {
        retry()
      }
      client.end()
    })

  })

}
