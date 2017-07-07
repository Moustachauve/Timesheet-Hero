var edge = require('electron-edge');

var lockedData = require('./lockedData');

'use strict'

module.exports = function() {
    var self = this;
    var unsubscribeCsharpEvent;

    this.start = function() {
        csharpEventSessionSwitch({event_handler: function(data, b) {
            var isSessionLocked = data == 'SessionLock';
            console.log('SessionLock', isSessionLocked);
            
            lockedData.addData(isSessionLocked, null, function(err, success) {
                if(err) {
                    throw err;
                }

                console.log('success?', success);
            });
        }}, function (err, unsubscribe) {
            if(err) throw err;

            console.log('subscribed!');
            unsubscribeCsharpEvent = unsubscribe;
        });
    }
    this.stop = function() {
        if(unsubscribeCsharpEvent) {
            unsubscribeCsharpEvent();
        }
    }

    var csharpEventSessionSwitch = edge.func(function() {/*
        async (dynamic input) =>
        {
            var eventHandler = new Microsoft.Win32.SessionSwitchEventHandler((object sender, Microsoft.Win32.SessionSwitchEventArgs e) => {
                ((Func<object,Task<object>>)input.event_handler)(e.Reason.ToString());
            });

            Microsoft.Win32.SystemEvents.SessionSwitch += eventHandler;

            // Return a function that can be used by Node.js to 
            // unsubscribe from the event source.
            return (Func<object,Task<object>>)(async (dynamic data) => {
                Microsoft.Win32.SystemEvents.SessionSwitch -= eventHandler;
                eventHandler = null;
                return null;
            });
        };
    */});
}