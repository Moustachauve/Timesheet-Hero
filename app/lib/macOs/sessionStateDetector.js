'use strict'
const quartz = require('osx-quartz') // https://www.npmjs.com/package/osx-quartz
      , sessionStateDetector = {}
      
let previousLockStatus = true;

module.exports = sessionStateDetector

sessionStateDetector.startTracking = function (stateChangedCallback) {


  let monitorLockState = () => {
    let actualLockStatus = quartz.isScreenLocked();
    if(actualLockStatus != previousLockStatus) {
      // Upon a change, call the callback
      previousLockStatus = actualLockStatus;
      stateChangedCallback(previousLockStatus);
    }
  }

  this.intervalId = setInterval(monitorLockState, 2000) // Run every 2 seconds
  // https://gist.github.com/abhishekjairath/8bfb259c681ef52545b32c88db6336f5
}

sessionStateDetector.stopTracking = function () {
  clearInterval(this.intervalId)
}
