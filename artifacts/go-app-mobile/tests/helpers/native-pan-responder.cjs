const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { createRequire } = require('node:module');
const req = createRequire(path.join(process.cwd(), 'package.json'));

// Execute the installed RN implementation, including grant's dy reset and real
// touch-history velocity calculation. No copied PanResponder implementation.
function nativePanResponder() {
  const babel = req('@babel/core'), root = path.join(path.dirname(req.resolve('react-native/package.json')), 'Libraries/Interaction');
  const expoReq = createRequire(req.resolve('babel-preset-expo')), nativeReq = createRequire(expoReq.resolve('@react-native/babel-preset'));
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} }; cache.set(name, module.exports);
    const code = babel.transformSync(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
      filename: name + '.js', configFile: false, babelrc: false,
      plugins: [nativeReq('babel-plugin-syntax-hermes-parser'), nativeReq('@babel/plugin-transform-flow-strip-types'), nativeReq('@babel/plugin-transform-modules-commonjs')],
    }).code;
    vm.runInNewContext(code, { module, exports: module.exports, require: n => {
      if (n !== './TouchHistoryMath') throw Error('Unexpected native dependency: ' + n);
      return load('TouchHistoryMath');
    } });
    return module.exports;
  }
  return load('PanResponder').default;
}

function touchStream({ x = 380, y = 450, id = 0, time = 1000, historyEnumerable = true } = {}) {
  const initial = { x, y }; let clock = time, previous = { x, y, time }, stopped = 0;
  function event(dx = 0, dy = 0, ms = 20, ended = false) {
    clock += ms;
    const current = { x: initial.x + dx, y: initial.y + dy, time: clock };
    const record = { touchActive: !ended, startPageX: initial.x, startPageY: initial.y, startTimeStamp: time,
      previousPageX: previous.x, previousPageY: previous.y, previousTimeStamp: previous.time,
      currentPageX: current.x, currentPageY: current.y, currentTimeStamp: clock };
    previous = current;
    const point = { pageX: current.x, pageY: current.y, identifier: id, timestamp: clock };
    const event = { nativeEvent: { ...point, touches: ended ? [] : [point], changedTouches: [point] },
      stopPropagation() { stopped++; } };
    // The responder contract guarantees access to touchHistory, not enumerability.
    return Object.defineProperty(event, 'touchHistory', { enumerable: historyEnumerable, configurable: true, writable: true,
      value: { touchBank: [record], numberActiveTouches: ended ? 0 : 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: clock } });
  }
  return { event, get stopped() { return stopped; } };
}
module.exports = { nativePanResponder, touchStream };
