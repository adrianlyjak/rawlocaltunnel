
// normal a.pipe(b).pipe(a) does not seem to remove the piping
// once either socket is closed (which causes errors)
// this version cleans up the listeners

module.exports = function pipeSocketsTogether(a, b) {
  const handleA = (data) => b.write(data);
  const handleB = (data) => a.write(data);
  a.on('data', handleA);
  b.on('data', handleB);
  const off = () => {
    a.removeListener('data', handleA)
    b.removeListener('data', handleB)
  }
  a.once('close', off);
  b.once('close', off);
}
