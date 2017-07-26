'use strict';

const path = require("path");
const moment = require('moment');
const log = require('electron-log');
const {app, ipcMain, Menu, Tray, nativeImage} = require("electron");
const {autoUpdater} = require("electron-updater");
const isDev = require('electron-is-dev');
const mkdirp = require('mkdirp');
const timeTracker = new (require('./lib/timeTracker'))();
const lockedData = require('./lib/lockedData');
const globalSettings = require('./lib/globalSettings');
const windowManager = require('./lib/mainWindow');

const updateFeedUrl = "http://timesheethero.cgagnier.ca/";

if(isDev) {
    mkdirp.sync('./dist');
    log.transports.file.file = 'dist/log-dev.log';
}

console.log = log.info;
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// prevent multiple instances
var shouldQuit = app.makeSingleInstance(function(commandLine, workingDirectory) {
    if (mainWindow.browserWindow) {
        mainWindow.browserWindow.show();
        if (mainWindow.browserWindow.isMinimized()) {
            mainWindow.browserWindow.restore();
        }
        mainWindow.browserWindow.focus();
    }
});

if (shouldQuit) {
    console.log('App is already running...');   
    app.quit();
    return;
}


app.on('window-all-closed', function() {
  //TODO: Quit the window for real on all platform and re-create it when needed
  if (process.platform != 'darwin') {
    //app.quit();
  }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (!windowManager.isWindowCreated()) {
        windowManager.createWindow();
    }
});

app.on('ready', function () {
    console.log('App is ready.');

    var isSavingDone = false;
    var isSaving = false;
    var firstTimeClosing = true;

    var trayIconPath = '';
    if (process.platform === 'win32') {
        trayIconPath = path.join(__dirname, 'icon.ico');
    } else {
        trayIconPath = nativeImage.createFromPath(path.join(__dirname, 'trayIcon.png'));  
    }

    windowManager.init();

    console.log('Setting up the tray icon...');
    var trayIcon = new Tray(path.join(__dirname, 'trayIcon.png'));
    trayIcon.setToolTip('Timesheet Hero');

    console.log('Creating the main window...');
    windowManager.createWindow();

    //Save as unlocked when the app launch as we assume the computer is unlocked
    lockedData.addData(false, null, function(err, success) {
        if(err) {
            throw err;
        }
    });

    console.log('Starting the time tracker...');
    timeTracker.start();

    //TODO: Create a module to handle the autoUpdater
    autoUpdater.on('checking-for-update', () => {
        console.log('Checking for update...');
    })
    autoUpdater.on('update-available', (ev) => {
        console.log('Update available.', ev);
    })
    autoUpdater.on('update-not-available', (ev, info) => {
        console.log('Update not available.');
        windowManager.sendToRenderer('updateNotAvailable');
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
        console.log('Update downloaded');
        windowManager.webContents.send('updateDownloaded', ev);
    });
    
    var contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show App', checked: true, click:  function() {
                windowManager.createWindow();
            } 
        },
        { 
            label: 'Quit', click:  function() {
                app.isQuiting = true;
                windowManager.closeWindow();
                timeTracker.stop();
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
            } 
        }
    ]);
    trayIcon.setContextMenu(contextMenu);
    trayIcon.on('click', function() {
        windowManager.createWindow();
    });
    
    lockedData.on('dataChange', function(date, data) {
        windowManager.sendToRenderer('lockedDataChange', date.valueOf(), data);
    });
    globalSettings.on('dataChange', function(date, data) {
        windowManager.sendToRenderer('globalSettingsChange', data);
        console.log('settings changed');
    });

    windowManager.on('windowClosed', function (event) {
        if(!app.isQuiting  && process.platform === 'win32'){
            if(firstTimeClosing) {
                trayIcon.displayBalloon({title: '', content: 'The app is still running in the background.'});

                firstTimeClosing = false;
            }
        }
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

    ipcMain.on('saveWeekPlan', (event, dateMs, weekPlan) => {
        var date = moment(dateMs);
        lockedData.saveWeekPlan(date, weekPlan, function(err) {
            if(err) { throw err; }
        });
    });

    ipcMain.on('notify', (event, title, content) => {
        trayIcon.displayBalloon({title: title, content: content});
    });

    ipcMain.on('checkForUpdates', (event, title) => {
        console.log('Checking for updates (manually)...');
        autoUpdater.checkForUpdates();
    });

    ipcMain.on('installUpdate', (event, title, content) => {
        console.log('restarting...');
        autoUpdater.quitAndInstall();
    });

    ipcMain.on('windowMinimize', (event) => {
        windowManager.browserWindow.minimize();
    });

    ipcMain.on('windowMaximize', (event) => {
        if(windowManager.browserWindow.isMaximized()) {
            windowManager.browserWindow.unmaximize();
        } else {
            windowManager.browserWindow.maximize();
        }
    });

    ipcMain.on('windowClose', (event) => {
        windowManager.closeWindow();
    });

    //if(!isDev) {
        autoUpdater.checkForUpdates();
    
        setInterval(function() {
            autoUpdater.checkForUpdates();
        }, 21600000); //6hrs
        
    //}

    console.log('App is ready and running!');
});