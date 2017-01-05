const log = require('loglevel');

module.exports = function socketLinker(tag, myQueue, theirQueue, piped) {

  function link(mySocket, theirSocket) {

    function bothWays(functionOfAAndB) {
      functionOfAAndB(mySocket, theirSocket);
      functionOfAAndB(theirSocket, mySocket);
    }

    const pair = [mySocket, theirSocket];

    let uninitialized = false;
    function uninitialize() {
      if (!uninitialized) {
        log.debug('removing connection pair')
        pair.forEach(x => x.destroy());
        const idx = piped.indexOf(pair);
        piped.splice(idx, 1);
        uninitialized = true;
      }
    }

    piped.push(pair);

    const [a, b] = pair

    const idx = () => piped.indexOf(pair);

    a.pipe(b).pipe(a);

    pair.forEach(x => {
      x.on('close', () => uninitialize());
      x.on('error', (ex) => {
        log.error('socket errored', ex);
        uninitialize();
      });
    });



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
      removeFromQueue: (reason) => {
        const idx = myQueue.indexOf(bufferWrapper);
        myQueue.splice(idx, 1);
        log.debug('remove from queue because', reason || '[no reason]');
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
    var action = null
    if (theirQueue.length === 0) {
      action = 'queu'
      queue(newSocket);
    } else {
      action = 'pair'
      theirQueue[0].linkTo(newSocket);
    }
    log.debug(`${tag}: ${action}ed socket. new counts myQueue: ${myQueue.length} theirQueue ${theirQueue.length}`)
  }
}
