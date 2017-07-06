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

var window = null;

// prevent multiple instances
var shouldQuit = app.makeSingleInstance(function(commandLine, workingDirectory) {
    if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
    }
});

if (shouldQuit) {
    console.log('App is already running...');   
    app.quit();
    return;
}


app.on('window-all-closed', function() {
  if (process.platform != 'darwin') {
    app.quit();
  }
});

app.on('ready', function () {

    var isSavingDone = false;
    var isSaving = false;

    timeTracker.start();
    window = new BrowserWindow({
        frame: true,
        icon: path.join(__dirname, 'icon.ico')
    });

    if(isDev) {
        window.openDevTools();
    }

    //TODO: Create a module to handle the autoUpdater
    autoUpdater.on('checking-for-update', () => {
        console.log('Checking for update...');
    })
    autoUpdater.on('update-available', (ev) => {
        console.log('Update available.', ev);
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
    autoUpdater.on('update-downloaded', (ev) => {
        console.log('Update downloaded', ev);
        window.webContents.send('updateDownloaded', ev);
    });

    //Add unlock at start if computer is already unlocked
    if(!timeTracker.isLocked()) {
        lockedData.addData(false, null, function(err, success) {
            if(err) {
                throw err;
            }
        });
    }
    
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
                timeTracker.stop();
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

    lockedData.on('dataChange', function(date, data) {
        window.webContents.send('lockedDataChange', date.valueOf(), data);
    });
    globalSettings.on('dataChange', function(date, data) {
        window.webContents.send('globalSettingsChange', data);
        console.log('settings changed');
    });

    window.on('close', function (event) {
        if(!app.isQuiting){
            event.preventDefault();
            trayIcon.displayBalloon({title: '', content: 'The app is still running in the background.'});
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
                timeTracker.stop();
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

    ipcMain.on('setOverrideStartTime', (event, dateMs, time) => {
        var date = moment(dateMs);
        lockedData.setOverrideStartTime(date, time, function(err) {
            if(err) { throw err; }
        });
    });

    ipcMain.on('setOverrideStopTime', (event, dateMs, time) => {
        var date = moment(dateMs);
        lockedData.setOverrideStopTime(date, time, function(err) {
            if(err) { throw err; }
        });
    });

    ipcMain.on('notify', (event, title, content) => {
        trayIcon.displayBalloon({title: title, content: content});
    });

    ipcMain.on('installUpdate', (event, title, content) => {
        console.log('restarting...');
        autoUpdater.quitAndInstall();
    });

    if(!isDev) {
        autoUpdater.checkForUpdates();
    
        setInterval(function() {
            console.log('Checking for updates...');
            autoUpdater.checkForUpdates();
        }, 7200000); //2hrs
    }
});