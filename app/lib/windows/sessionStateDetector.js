'use strict'

var edge = require('electron-edge-js')

var sessionStateDetector = {}
module.exports = sessionStateDetector

var unsubscribeCsharpEvent

sessionStateDetector.startTracking = function (stateChangedCallback) {
  csharpEventSessionSwitch({event_handler: function (data, b) {
    console.log(data);
    var isSessionLocked = data.state === 'SessionLock'
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
    using System;
    using System.Runtime.InteropServices;
    using System.Threading.Tasks;

    class Startup 
    {
        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int smIndex);
  
        public async Task<object> Invoke (dynamic input)
        {
            var eventHandler = new Microsoft.Win32.SessionSwitchEventHandler((object sender, Microsoft.Win32.SessionSwitchEventArgs e) => {
                // Used to detect if the user is logged in through a remote session
                bool isRemoteSession = GetSystemMetrics(0x1000) != 0;
                ((Func<object,Task<object>>)input.event_handler)(new { 
                    state = e.Reason.ToString(),
                    isRemoteSession = isRemoteSession
                });
            });

            Microsoft.Win32.SystemEvents.SessionSwitch += eventHandler;

            // Return a function that can be used by Node.js to 
            // unsubscribe from the event source.
            return (Func<object,Task<object>>)(async (dynamic data) => {
                Microsoft.Win32.SystemEvents.SessionSwitch -= eventHandler;
                eventHandler = null;
                return null;
            });
        }
    }
*/ })
