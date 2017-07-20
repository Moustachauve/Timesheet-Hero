'use strict';

const path = require("path");
const timeTracker = new (require('./lib/timeTracker'))();
const lockedData = require('./lib/lockedData');
const globalSettings = require('./lib/globalSettings');
const moment = require('moment');
const log = require('electron-log');
const {app, BrowserWindow, ipcMain, Menu, Tray, nativeImage} = require("electron");
const {autoUpdater} = require("electron-updater");
const isDev = require('electron-is-dev');
const windowStateKeeper = require('electron-window-state');
const mkdirp = require('mkdirp');

const updateFeedUrl = "http://timesheethero.cgagnier.ca/";

if(isDev) {
    mkdirp.sync('./dist');
    log.transports.file.file = 'dist/log-dev.log';
}

console.log = log.info;
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

var window = null;

// prevent multiple instances
var shouldQuit = app.makeSingleInstance(function(commandLine, workingDirectory) {
    if (window) {
        window.show();
        if (window.isMinimized()) {
            window.restore();
        }
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
    console.log('App is ready.');


    var isSavingDone = false;
    var isSaving = false;
    var firstTimeClosing = true;

    var windowIconPath = '';
    var trayIconPath = '';
    if (process.platform === 'win32') {
        windowIconPath = path.join(__dirname, 'icon.ico');
        trayIconPath = windowIconPath;
    } else {
        windowIconPath = path.join(__dirname, 'icon.png');
        trayIconPath = nativeImage.createFromPath(path.join(__dirname, 'trayIcon.png'));  
    }

    let mainWindowState = windowStateKeeper({
        defaultWidth: 1000,
        defaultHeight: 625
    });

    window = new BrowserWindow({
        backgroundColor: '#303030',
        frame: false,
        icon: windowIconPath,
        minWidth: 325,
        minHeight: 250,
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height,
        isMaximized: mainWindowState.isMaximized
    });

    window.setMenu(null);
    window.loadURL(path.join(__dirname, 'views/index.html'));
    console.log(path.join(__dirname, 'views/index.html'));
    if(isDev) {
        window.openDevTools();
    }
    mainWindowState.manage(window);
    window.show();

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
        window.webContents.send('updateNotAvailable');
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
        window.webContents.send('updateDownloaded', ev);
    });
    
    console.log('Setting up the tray icon...');
    var trayIcon = new Tray(trayIconPath);
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

    window.tray = trayIcon;
    
    lockedData.on('dataChange', function(date, data) {
        window.webContents.send('lockedDataChange', date.valueOf(), data);
    });
    globalSettings.on('dataChange', function(date, data) {
        window.webContents.send('globalSettingsChange', data);
        console.log('settings changed');
    });

    window.on('close', function (event) {
        if(!app.isQuiting  && process.platform === 'win32'){
            event.preventDefault();
            if(firstTimeClosing) {
                trayIcon.displayBalloon({title: '', content: 'The app is still running in the background.'});
                firstTimeClosing = false;
            }
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

    window.on('maximize', function(event) {
        window.webContents.send('windowMaximize');
    });

    window.on('unmaximize', function(event) {
        window.webContents.send('windowUnmaximize');
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
        window.minimize();
    });

    ipcMain.on('windowMaximize', (event) => {
        if(window.isMaximized()) {
            window.restore();
        } else {
            window.maximize();
        }
    });

    ipcMain.on('windowClose', (event) => {
        window.hide();
    });

    //if(!isDev) {
        /*autoUpdater.checkForUpdates();
    
        setInterval(function() {
            autoUpdater.checkForUpdates();
        }, 21600000); //6hrs
        */
    //}

    console.log('App is ready and running!');
});