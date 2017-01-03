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

    fetchRemotePorts({
        remoteHostname,
        remoteApiPort,
    }).then(({externalPort, internalPort}) => {

        console.log(`${remoteHostname} ${externalPort}`)

        for (let i = 0; i < 10; i++) {
          return formTunnelWithRemote({
              localHostname,
              localPort,
              remoteHostname,
              remotePort: internalPort
          })
        }


      })

}


const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 1,
    keepAliveMsecs: 3000
})

function fetchRemotePorts({
    remoteHostname,
    remoteApiPort
}) {
    return new Promise((ok, nope) => {
        const req = http.request({
            method: 'GET',
            path: '/',
            protocol: 'http:',
            hostname: remoteHostname,
            port: remoteApiPort,
            agent: httpAgent
        }, (res) => {
            res.setEncoding('utf8');
            res.once('data', (data) => ok(JSON.parse(data)))
                // keep the response open indefinitely.
                // Server only keeps ports open as long as this is open
        });
        req.on('error', (e) => nope(e))
        req.on('close', (...args) => log.error('remote tunnel closed!', ...args))
        req.end()
    });

}


function formTunnelWithRemote({
    localHostname,
    localPort,
    remoteHostname,
    remotePort
}) {
    function reconnect() {
        return new Promise((resolve, reject) => {
            const remote = net.connect({
                port: remotePort,
                host: remoteHostname
            }, () => {
                log.info('connected to remote')
                resolve(remote)
            })

        }).then((remote) => {

            remote.on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    var e = new Error('connection refused: ' + remoteHostname + ':' + remotePort + ' (check your firewall settings)');
                    log.error('cannot connect to server', e)
                    throw e;
                }

                remote.end();
            });


            const pair = () => {
                remote.pause()

                function attempt() {
                  log.debug('retry local connection');
                  const retry = () => {
                    log.debug('local connection refused');
                    setTimeout(attempt, 500);
                  }

                  const client = net.connect({
                      port: localPort,
                      host: localHostname
                  }, (connected) => {
                      log.info('port connected to local server');
                      client.removeListener('error', retry);
                      remote.resume();


                      function close() {
                          client.end();
                          remote.end();
                          reconnect()
                      }

                      function both(f) {
                          f(client, remote);
                          f(remote, client);
                      }

                      both((a, b) => {
                          a.pipe(b);
                          a.on('error', (ex) => {
                              log.error(ex);
                              close()
                          });
                          a.on('close', close);
                      });


                  });

                  client.once('error', retry)
                }
                attempt()
            }

            pair();

        });
    }
    reconnect();
}

function retryLocal(opts) {
    const {
        localPort,
        localHostname,
        remote
    } = opts

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
