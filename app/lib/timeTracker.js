var ffi = require('ffi');
var ref = require('ref');

var lockedData = require('./lockedData');

'use strict'

// user32.dll
var intPtr = ref.refType('int');
var user32 = new ffi.Library('user32', {
'OpenInputDesktop': [
    'int', [ 'int32', 'bool', 'int32' ]
]
});

module.exports = function() {
    var self = this;
    var lastLockTime = 0;
    var lockCheckInterval;

    this.start = function() {
        if(lockCheckInterval) {
            clearInterval(lockCheckInterval);
        }
        lockCheckInterval = setInterval(function () {
            if(self.isLocked()) {
                if(!lastLockTime) {
                    lastLockTime = new Date();
                    console.log(lastLockTime.toLocaleString());
                    lockedData.addData(true, null, function(err, success) {
                        if(err) {
                            throw err;
                        }
                    });
                }
            } else {
                if(lastLockTime) {
                    lastLockTime = 0;
                    lockedData.addData(false, null, function(err, success) {
                        if(err) {
                            throw err;
                        }
                    });
                }
            }
        }, 1000);
    }
    this.stop = function() {
        if(lockCheckInterval) {
            clearInterval(lockCheckInterval);
        }
    }

    this.isLocked = function() {
        return !user32.OpenInputDesktop(0, false, 0x0001);
    }
}