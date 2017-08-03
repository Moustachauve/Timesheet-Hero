'use strict'

const lockedData = require('./lockedData')

if (process.platform === 'win32') {
  var sessionStateDetecor = require('./windows/sessionStateDetector')
} else if (process.platform === 'darwin') {
  sessionStateDetecor = require('./macOs/sessionStateDetector')
} else {
  console.error('Unsuported platform: ' + process.platform)
  throw new Error('Sorry, your system is not supported. Only Windows and MacOS are supported.')
}

module.exports = function () {
  this.start = function () {
    sessionStateDetecor.startTracking(onStateChange)
  }
  this.stop = function () {
    sessionStateDetecor.stopTracking()
  }

  function onStateChange (state) {
    console.log('state changed: ', state)
    lockedData.addData(state, null, function (err, success) {
      if (err) {
        throw err
      }
    })
  }
}
