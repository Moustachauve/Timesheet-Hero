var inherits = require('util').inherits;  
var EventEmitter = require('events').EventEmitter;

'use strict'
module.exports = timesheetParser;

const defaultTimeToWork = 35;

const tableSelector = '#detail-container table.timesheet';

function timesheetParser() {

    const self = this;
    EventEmitter.call(this);
    var html;
    
    var minPauseTime = 30 * 60 * 1000; //30 mins

    var selectedWeek;
    var daysInfo;

    if(!localStorage.timesheet_plugin_daysOff) {
        localStorage.timesheet_plugin_daysOff = JSON.stringify({});
    }
    var daysOff = JSON.parse(localStorage.timesheet_plugin_daysOff);


    if(!localStorage.timesheet_plugin_minTimeToWork) {
        setTimeToWork(35);
    }

    this.weekday = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
    ];

    this.parse = function(htmlToParse) {
        html = htmlToParse;
        selectedWeek = $('#detail-container .date_range h3', html).text();
        var days = getDatesFromHtml();
        daysInfo = calculateTime(days);
        self.emit('changed', daysInfo);
    }

    function dateFromString(str) {
        var match = str.trim().match(/^(\d+)-(\d+)-(\d+) (\d+)\:(\d+)\:(\d+)$/);
        if(match) {
            return new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]);
        }
        return 0;
    }

    function getDatesFromHtml() {
        var days = [];
        var rows = $(tableSelector + ' tr.in-out-list', html);

        rows.each(function(row) {
            var dateStart = dateFromString($(this).find('td:nth-last-child(3)').text());
            var dateEnd = dateFromString($(this).find('td:nth-last-child(2)').text());

            if(!dateStart || !dateEnd) {
                return;
            }
            var timeDiff = dateEnd - dateStart;

            var dayNumber = dateStart.getDay() - 1;
            if(dayNumber < 0) {
                dayNumber = 6;
            }

            if(!days[dayNumber]) {
                days[dayNumber] = [];
            }

            days[dayNumber].push({dateStart: dateStart, dateEnd: dateEnd});
        });

        return days;
    }

    function calculateTime(days) {
        var result = {};
        result.realTotal = 0;
        for(var i = 0; i < 7; i++) {
            var day = self.weekday[i];
            result[day] = {};
            var dayOff = self.isDayOff(i);

            result[day].workTime = 0;
            result[day].pauseTime = 0;
            result[day].adjustedTime = 0;

            if(!days[i] && !dayOff) {
                continue;
            }

            if(dayOff) {
                result[day].workTime = 7 * 1000 * 60 * 60;
                result[day].pauseTime = 0;
                result[day].adjustedTime = result[day].workTime;
            }
            else {
                var currentDay = days[i];
                var previousEnd = 0;
                for(var j = 0; j < currentDay.length; j++) {
                    result[day].workTime += currentDay[j].dateEnd - currentDay[j].dateStart;
                    if(previousEnd) {
                        result[day].pauseTime += currentDay[j].dateStart - previousEnd;
                    }

                    previousEnd = currentDay[j].dateEnd;
                }

                if(result[day].pauseTime < minPauseTime) {
                    result[day].pauseTimeAdjustment = minPauseTime - result[day].pauseTime;
                    result[day].adjustedTime = result[day].workTime - result[day].pauseTimeAdjustment;
                } else {
                    result[day].adjustedTime = result[day].workTime;
                }
            }

            result.realTotal += result[day].adjustedTime;
        }
        return result;
    }

    this.setTimeToWork = function(timeInHours) {
        localStorage.setItem('timesheet_plugin_minTimeToWork', timeInHours * 60 * 60 * 1000);
    }

    this.getTimeString = function(ms) {
        if(ms <= 0) {
            return '00:00:00';
        }

        var seconds = ms / 1000;
        var hours = parseInt( seconds / 3600 );
        seconds = seconds % 3600;
        var minutes = parseInt( seconds / 60 );
        seconds = seconds % 60;
        return formatIntTwoDigits(hours) + ":" + formatIntTwoDigits(minutes) + ":" + formatIntTwoDigits(seconds);
    }

    function formatIntTwoDigits(integer) {
        return ("0" + integer).slice(-2);
    }

    this.isDayOff = function(indexDayOfWeek) {
        return daysOff[selectedWeek + '_' + indexDayOfWeek];
    }

    this.setDayOff = function(indexDayOfWeek, value) {
        daysOff[selectedWeek + '_' + indexDayOfWeek] = value;
        localStorage.timesheet_plugin_daysOff = JSON.stringify(daysOff);
        self.parse(html);
    }
}

inherits(timesheetParser, EventEmitter);