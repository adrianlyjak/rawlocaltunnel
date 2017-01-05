const createApp = require('../lib/server');
const fetchRemotePorts = require('../lib/util/fetchRemotePorts')
const should = require('should');
const net = require('net');
const log = require('loglevel');

function KillSwitch() {
  let queue = [];
  let resolved = false;
  const killSwitch = {
    then(cb) {
      if (!queue) cb()
      else queue.push(cb)
    },
    kill() {
      queue.forEach(x => x());
      queue = null;
    }
  }
  return killSwitch;
}

function withConnection(cb) {
  const killSwitch = KillSwitch();
  const emitter = fetchRemotePorts({
    hostname: '127.0.0.1',
    port: 3001
  })
  new Promise((ok, nope) => emitter.once('open', ok))
  .then(response => cb(response))
  .then(x => emitter.quit())
  .catch(ex => {
    emitter.quit();
    throw ex;
  });

}

function withSockets(cb) {
  return withConnection(({ externalPort, internalPort }) => {
    return Promise.all([connect(internalPort), connect(externalPort)]);
  })
}

const connect = port => new Promise((resolve, reject) => {
  const sock = net.connect({ host: 'localhost', port }, () => {
    sock.setEncoding('utf8');
    resolve(sock);
  })
  sock.on('error', reject)
})

const connectTimes = times => ports => {
  const promises = [];
  for (let i = 0; i < times; i++) {
    ports.forEach(x => promises.push(connect(x)));
  }
  return Promise.all(promises);

}

const once = type => socket => new Promise((resolve, reject) => socket.once(type, resolve));
const onceData = once('data');


describe('Server', () => {

    let app = null;

    before(() => {
      return createApp({ listenPort: 3001, logLevel: 'error' }).then(_app => {
        app = _app;
      })
    });

    after((done) => app.close(done));

    it('should return two random ports', () => {

      return withConnection(result => {
          result.internalPort.should.be.a.Number();
          result.externalPort.should.be.a.Number();
          return
       });

    });

    it('ports should be open', () => {

      return withSockets(() => null)

    });

    it('should send data both ways', () => {
      return withSockets(([a, b]) => {
        console.log('withcSockets');
        a.write('1');
        return onceData(b).then(data => {
          data.should.be.equal('1');
          b.write('2');
          return onceData(a);
        }).then(data => {
          data.should.be.equal('2');
        });

      });
    });

    it('should send data only along single channel', () => {
      return withConnection(({ externalPort: a, internalPort: b}) => {
        return Promise.all([connect(a), connect(b)])
        .then(([a1, b1]) => {
          return Promise.all([connect(a), connect(b)])
            .then(([a2, b2]) => [a1, b1, a2, b2])
        })
        .then(([a1, b1, a2, b2]) => {

          a1.write('a1')
          b1.write('b1')
          a2.write('a2')
          b2.write('b2')
          return Promise.all([onceData(a1), onceData(b1), onceData(a2), onceData(b2)])
        })
        .then(([ab1, ba1, ab2, ba2]) => {

          ab1.should.be.equal('b1');
          ba1.should.be.equal('a1');
          ab2.should.be.equal('b2');
          ba2.should.be.equal('a2');
        })
      })

    })

    it('should hang the other end up, no matter what end killed the channel', () => {
      return withConnection(({ internalPort: a, externalPort: b }) => {
        return Promise.all([connect(a), connect(b)])
        .then(([a1, b1]) => {
          return Promise.all([connect(a), connect(b)])
            .then(([a2, b2]) => [a1, b1, a2, b2])
        })
        .then(([a1, b1, a2, b2]) => {
            a1.destroy()
            b2.destroy()
            return Promise.all([
              once('end')(b1),
              once('end')(a2)
            ]);
        });

      });

    });

    it('should deal with a slew of connections', () => {

      const bytes = '1'
      return withConnection(({internalPort: a, externalPort: b}) => {
        // my current machine can only handle 1000 before weird network errors happen
        return connectTimes(10)([a, b])
          .then(sockets => {
            log.debug('all connected');
            return Promise.all(sockets.map((x, i) => {
              x.write(bytes)
              return onceData(x).then(data => {
                x.destroy();
                return data;
              });
            }))
          })
          .then(results => {
            log.debug('all dataed');
            results.forEach(x => x.should.be.equal('1'));
          })
      })
    }).timeout(4000)

})
