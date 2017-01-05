const http = require('http');
const log = require('logLevel');
const EventEmitter = require('events');

const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 1,
    keepAliveMsecs: 3000
})

module.exports = function fetchRemotePorts({
    hostname,
    port,
    killSwitch
}) {
    const emitter = new EventEmitter();
    let quit = null;
    let killed = false;

    const req = http.request({
        method: 'GET',
        path: '/',
        protocol: 'http:',
        hostname,
        port,
        agent: httpAgent
    }, (res) => {

        log.debug('server responded');
        res.setEncoding('utf8');
        function open(data) {
          emitter.emit('open', JSON.parse(data));
          res.removeListener('data', open);
        }
        res.on('data', open);

        // keep the response open indefinitely.
        // Server only keeps ports open as long as this connection remains open
        quit = () => {
          req.abort();
        }
        if (killed) quit()

    });
    req.on('error', (e) => emitter.emit('error', e));
    req.on('close', (...args) => {
      log.warn('remote tunnel closed!', ...args)
      emitter.emit('close');
    });
    req.end()
    emitter.quit = () => {
      killed = true;
      quit && quit();
    }
    return emitter;

}
