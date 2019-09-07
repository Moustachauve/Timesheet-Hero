'use strict'
const quartz = require('osx-quartz') // https://www.npmjs.com/package/osx-quartz
const sessionStateDetector = {}

let previousLockStatus = true

module.exports = sessionStateDetector

sessionStateDetector.startTracking = function (stateChangedCallback) {
  const monitorLockState = () => {
    const actualLockStatus = quartz.isScreenLocked()
    if (actualLockStatus !== previousLockStatus) {
      // Upon a change, call the callback
      previousLockStatus = actualLockStatus
      stateChangedCallback(previousLockStatus)
    }
  }

  this.intervalId = setInterval(monitorLockState, 10000) // Run every 10 seconds
  // https://gist.github.com/abhishekjairath/8bfb259c681ef52545b32c88db6336f5
}

sessionStateDetector.stopTracking = function () {
  clearInterval(this.intervalId)
}
