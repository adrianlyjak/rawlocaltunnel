const net = require('net');
const http = require('http');
const log = require('loglevel');
const pipeSocketsTogether = require('./pipeSocketsTogether');
const fetchRemotePorts = require('./util/fetchRemotePorts');


module.exports = function main({
    logLevel = 'error',
    remoteHostname = 'localhost',
    remoteApiPort = 3000,
    localPort,
    localHostname = 'localhost',
}) {
    log.setLevel(logLevel);

    if (!localPort) throw new Error('no local port specified');

    const connection = fetchRemotePorts({
        hostname: remoteHostname,
        port: remoteApiPort,
    })

    connection.once('open', ({externalPort, internalPort}) => {

        console.log(`${remoteHostname} ${externalPort}`)

        for (let i = 0; i < 10; i++) {
          return formTunnelWithRemote({
              localHostname,
              localPort,
              remoteHostname,
              remotePort: internalPort
          })
        }


    });

    connection.once('close', () => process.exit());
    connection.once('error', () => process.exit(1));
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




                      const [a, b] = [client, remote];

                      function close() {
                          a.end(); b.end();
                          reconnect();
                      }

                      a.pipe(b).pipe(a);
                      [a, b].forEach(x => {
                        x.on('error', (ex) => {
                            log.error(ex);
                            close()
                        });
                        x.on('close', close);
                      });

                  });

                  client.once('error', retry);
                }
                attempt()
            }

            pair();

        });
    }
    reconnect();
}
