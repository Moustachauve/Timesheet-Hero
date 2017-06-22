'use strict';

const path = require("path");
const timeTracker = new (require('./lib/timeTracker'))();
const lockedData = require('./lib/lockedData');
const globalSettings = require('./lib/globalSettings');
const moment = require('moment');
const log = require('electron-log');
const {app, BrowserWindow, ipcMain, Menu, Tray} = require("electron");
const {autoUpdater} = require("electron-updater");
const isDev = require('electron-is-dev');

const updateFeedUrl = "http://timesheethero.cgagnier.ca/";

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
})
autoUpdater.on('update-available', (ev, info) => {
  console.log('Update available.');
})
autoUpdater.on('update-not-available', (ev, info) => {
  console.log('Update not available.');
})
autoUpdater.on('error', (ev, err) => {
  console.log('Error in auto-updater.');
})
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
})
autoUpdater.on('update-downloaded', (ev, info) => {
  console.log('Update downloaded; will install in 5 seconds');
  //TODO: ask user if they want to restart and install the updates
});



app.on('window-all-closed', function() {
  if (process.platform != 'darwin') {
    app.quit();
  }
});

app.on('ready', function () {
    if(!isDev) {
        autoUpdater.checkForUpdates();
    }

    //Add unlock at start if computer is already unlocked
    if(!timeTracker.isLocked()) {
        lockedData.addData(false, null, function(err, success) {
            if(err) {
                throw err;
            }
        });
    }

    var isSavingDone = false;
    var isSaving = false;

    timeTracker.start();
    var window = new BrowserWindow({
        frame: true,
        icon: path.join(__dirname, 'icon.ico')
    });
    
    var trayIcon = new Tray(path.join(__dirname, 'icon.ico'));
    trayIcon.setToolTip('Timesheet Hero');
    
    var contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show App', checked: true, click:  function() {
                window.show();
            } 
        },
        { 
            label: 'Quit', click:  function() {
                app.isQuiting = true;
                app.quit();
            } 
        }
    ]);
    trayIcon.setContextMenu(contextMenu);
    trayIcon.on('click', function() {
        window.show();
    });
    
    window.setMenu(null);
    window.tray = trayIcon;
    window.loadURL(path.join(__dirname, 'views/index.html'));
    window.show();
    window.openDevTools();

    lockedData.on('dataChange', function(date, data) {
        window.webContents.send('lockedDataChange', date.valueOf(), data);
    });
    globalSettings.on('dataChange', function(date, data) {
        window.webContents.send('globalSettingsChange', data);
        console.log('settings changed');
    });

    window.on('close', function (event) {
        if( !app.isQuiting){
            event.preventDefault();
            window.hide();
            return false;
        } 
        if(isSaving || !isSavingDone) {
            event.preventDefault();
        }

        if(!isSaving && !isSavingDone) {
            isSaving = true;
            lockedData.addData(true, null, function(err, success) {
                if(err) {
                    throw err;
                }
                isSaving = false;
                isSavingDone = true;
                app.quit();
            });
        } 
        
        return false;
    });

    ipcMain.on('setTimeOff', (event, dateMs, timeOff) => {
        var date = moment(dateMs);
        lockedData.setTimeOff(date, timeOff, function(err) {
            if(err) { throw err; }
        });
    });  

    ipcMain.on('setHoursToWork', (event, dateMs, hoursToWork) => {
        var date = moment(dateMs);
        lockedData.setHoursToWork(date, hoursToWork, function(err) {
            if(err) { throw err; }
        });
    });  
    
    ipcMain.on('setDayOff', (event, dateMs, isOff) => {
        var date = moment(dateMs);
        lockedData.setDayOff(date, isOff, function(err) {
            if(err) { throw err; }
        });
    });

    ipcMain.on('notify', (event, title, content) => {
        trayIcon.displayBalloon({title: title, content: content});
    });
});