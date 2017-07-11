var jsonfile = require('jsonfile');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var inherits = require('util').inherits;  
var EventEmitter = require('events').EventEmitter;
var os = require('os');
const isDev = require('electron-is-dev');

var globalSettings = require('./globalSettings');

'use strict'

var lockedData = new EventEmitter();
module.exports = lockedData;

var folder = path.join(os.homedir(), 'timesheet-hero/dates');

lockedData.addData = function(isLocked, date, callback) {
    if(!date) {
        date = moment();
    }
    
    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            var arrayKey = date.format('YYYY-MM-DD');
            if(!data.dates[arrayKey]) {
                data.dates[arrayKey] = getDefaultObject();
            }

            data.dates[arrayKey].lockTime.push({
                time: date.format('HH:mm:ss'),
                lockstate: isLocked
            });
            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.setTimeOff = function(date, timeOff, callback) {
    if(!date) {
        callback('No date!');
    }

    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            var arrayKey = date.format('YYYY-MM-DD');
            if(!data.dates[arrayKey]) {
                data.dates[arrayKey] = getDefaultObject();
            }
            data.dates[arrayKey].timeOff = timeOff;

            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.setHoursToWork = function(date, hoursToWork, callback) {
    if(!date) {
        callback('No date!');
    }

    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            data.hoursToWork = hoursToWork;
            
            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.setDayOff = function(date, isOff, callback) {
    if(!date) {
        callback('No date!');
    }

    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            var arrayKey = date.format('YYYY-MM-DD');
            if(!data.dates[arrayKey]) {
                data.dates[arrayKey] = getDefaultObject();
            } 

            data.dates[arrayKey].isOff = isOff;
            
            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.setOverrideStartTime = function(date, time, callback) {
    if(!date) {
        callback('No date!');
    }

    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            var arrayKey = date.format('YYYY-MM-DD');
            if(!data.dates[arrayKey]) {
                data.dates[arrayKey] = getDefaultObject();
            } 

            data.dates[arrayKey].overrideStartTime = time;
            
            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.setOverrideStopTime = function(date, time, callback) {
    if(!date) {
        callback('No date!');
    }

    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        lockedData.load(date, function(err, data) {
            if(err) { return callback(err); }
        
            var arrayKey = date.format('YYYY-MM-DD');
            if(!data.dates[arrayKey]) {
                data.dates[arrayKey] = getDefaultObject();
            } 

            data.dates[arrayKey].overrideStopTime = time;
            
            saveData(date, data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

lockedData.load = function (date, callback) {
    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        fs.access(filePath, function(err) {
            if(err && err.code === 'ENOENT') {
                console.log('Creating new file with name: ', getFileName(date));
                globalSettings.get('defaultHoursToWork', function(err, defaultHoursToWork) {
                    return callback(null, { 
                        hoursToWork: defaultHoursToWork,
                        version: 1,
                        dates: {}
                    });
                });

                return;
            }

            jsonfile.readFile(filePath, function(err, data) {
                return callback(err, data);
            });
        });
    });
}

lockedData.getAvailableDates = function(callback) {
    fs.readdir(folder, function(err, files) {
        if(err) { return callback(err); }

        var dates = [];
        for(var i = 0; i < files.length; i++) {
            var fileStat = fs.statSync(path.join(folder, files[i]));
            if(fileStat.isDirectory()) { 
                continue;
            }

            files[i] = files[i].slice(0, -5);
            files[i] = files[i].replace('-dev', '');

            var date = moment(files[i]);
            if(date.isValid()) {
                dates.push(date);
            }
        }

        return callback(null, dates);
    });
}

function getDefaultObject() {
    var settings = globalSettings.loadSync();
    return {
        timeOff: settings.defaultTimeOff,
        isOff: false,
        lockTime: []
    };
}

function saveData(date, data, callback) {
    getFilePath(date, function(err, filePath) {
        if(err) { return callback(err); }

        jsonfile.writeFile(filePath, data, function(err) {
            if(err) { return callback(err); }
            lockedData.emit('dataChange', date, data);
            return callback();
        });
    });
}

function getFilePath(date, callback) {
    var filename = getFileName(date);
    mkdirp(folder, function(err) {
        if(err) { return callback(err); }

        return callback(null, path.join(folder, filename));
    });
}

function getFileName(date) {
    return moment(date).startOf('isoWeek').format('YYYY-MM-DD') + (isDev ? '-dev' : '') + '.json';
}