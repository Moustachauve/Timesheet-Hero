'use strict';

if(require('electron-squirrel-startup')) return;

const AutoUpdater = require('auto-updater');

const path = require("path");
var timeTracker = new (require('./lib/timeTracker'))();
var lockedData = require('./lib/lockedData');
var globalSettings = require('./lib/globalSettings');
var moment = require('moment');
const {app, BrowserWindow, ipcMain, Menu, Tray} = require("electron");

app.on('window-all-closed', function() {
  if (process.platform != 'darwin') {
    app.quit();
  }
});

var autoupdater = new AutoUpdater({
     pathToJson: '',
     autoupdate: false,
     checkgit: true,
     jsonhost: 'raw.githubusercontent.com',
     contenthost: 'codeload.github.com',
     progressDebounce: 0,
     devmode: false
});

autoupdater.on('git-clone', function() {
    console.log("You have a clone of the repository. Use 'git pull' to be up-to-date");
});
autoupdater.on('check.up-to-date', function(v) {
    console.info("You have the latest version: " + v);
});
autoupdater.on('check.out-dated', function(v_old, v) {
    console.warn("Your version is outdated. " + v_old + " of " + v);
    autoupdater.fire('download-update'); // If autoupdate: false, you'll have to do this manually. 
    // Maybe ask if the'd like to download the update. 
});
autoupdater.on('update.downloaded', function() {
    console.log("Update downloaded and ready for install");
    autoupdater.fire('extract'); // If autoupdate: false, you'll have to do this manually. 
});
autoupdater.on('update.not-installed', function() {
    console.log("The Update was already in your folder! It's read for install");
    autoupdater.fire('extract'); // If autoupdate: false, you'll have to do this manually. 
});
autoupdater.on('update.extracted', function() {
    console.log("Update extracted successfully!");
    console.warn("RESTART THE APP!");
});
autoupdater.on('download.start', function(name) {
    console.log("Starting downloading: " + name);
});
autoupdater.on('download.progress', function(name, perc) {
    process.stdout.write("Downloading " + perc + "% \n");
});
autoupdater.on('download.end', function(name) {
    console.log("Downloaded " + name);
});
autoupdater.on('download.error', function(err) {
    console.error("Error when downloading: " + err);
});
autoupdater.on('end', function() {
    console.log("The app is ready to function");
});
autoupdater.on('error', function(name, e) {
    console.error(name, e);
});

// Start checking 
autoupdater.fire('check');

app.on('ready', function () {
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
        icon:'./icon.png'
    });
    
    var trayIcon = new Tray('./icon.png');
    trayIcon.setToolTip('Timesheet Helper');
    
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