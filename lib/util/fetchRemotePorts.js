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
        res.once('data', (data) => emitter.emit('open', JSON.parse(data)));

        // keep the response open indefinitely.
        // Server only keeps ports open as long as this connection remains open
        quit = () => {
          log.info('aborting response');
          req.abort();
        }

    });
    req.on('error', (e) => emitter.emit('error', e));
    req.on('close', (...args) => {
      log.warn('remote tunnel closed!', ...args)
      emitter.emit('close');
    });
    req.end()
    emitter.quit = () => quit && quit();
    return emitter;

}
