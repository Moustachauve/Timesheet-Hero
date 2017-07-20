'use strict'

if(process.platform === 'win32') {
    var sessionStateDetecor = require('./windows/sessionStateDetector');
} else if (process.platform === 'darwin') {
    var sessionStateDetecor = require('./macOs/sessionStateDetector');
} else {
    console.error('Unsuported platform: ' + process.platform);
    throw 'Sorry, your system is not supported. Only Windows and MacOS are supported.';
}

var lockedData = require('./lockedData');

module.exports = function() {

    this.start = function() {
        sessionStateDetecor.startTracking(onStateChange);
    }
    this.stop = function() {
        sessionStateDetecor.stopTracking();
    }

    function onStateChange(state) {
        console.log('state changed: ', state);
        lockedData.addData(isSessionLocked, null, function(err, success) {
            if(err) {
                throw err;
            }

            console.log('success?', success);
        });
    }
}