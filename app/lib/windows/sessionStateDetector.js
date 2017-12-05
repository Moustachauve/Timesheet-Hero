'use strict'

var edge = require('electron-edge-js')

var sessionStateDetector = {}
module.exports = sessionStateDetector

var unsubscribeCsharpEvent

sessionStateDetector.startTracking = function (stateChangedCallback) {
  csharpEventSessionSwitch({event_handler: function (data, b) {
    var isSessionLocked = data === 'SessionLock'
    stateChangedCallback(isSessionLocked)
  }}, function (err, unsubscribe) {
    if (err) throw err
    unsubscribeCsharpEvent = unsubscribe
  })
}

sessionStateDetector.stopTracking = function () {
  if (unsubscribeCsharpEvent) {
    unsubscribeCsharpEvent()
  }
}

var csharpEventSessionSwitch = edge.func(function () { /*
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
*/ })
