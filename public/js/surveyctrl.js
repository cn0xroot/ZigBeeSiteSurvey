/**
 * Angular.js controller for the site survey tool
 * Created by kc on 25.06.15.
 */
'use strict';
var surveyControl = angular.module('surveyApp', ['n3-line-chart', 'ngSanitize', 'ngCsv']);
surveyControl.controller('surveyCtrl', ['$scope', '$http', function ($scope, $http) {
  $scope.settings = {
    levels: {
      min: -128, // just a default until we loaded the data from the server
      max: 0
    }
  };
  $scope.panel = 'networks';
  $scope.networks = [];
  $scope.networkScanActive = false;
  $scope.continousScanningActive = false;
  $scope.measurements = [];
  $scope.networkFailureCounter = 0;
  $scope.currentLocation = '';
  $scope.log = [];
  $scope.usbConnected = false;
  $scope.startingUp = true;
  $scope.surveyReady = false; // True when connected and dongle first time seen

  $scope.chartOptions = {
    axes: {
      x: {key: 'ts', ticksFormat: '%H:%M:%S', type: 'date', zoomable: true},
      y: {type: 'linear', min: $scope.settings.levels.min, max: $scope.settings.levels.max + 1},
      y2: {type: 'linear', min: 0, max: 255}
    },
    margin: {
      left: 30,
      right: 60
    },
    series: [
      {y: 'rssi', color: 'blue', thickness: '2px', type: 'line', label: 'RSSI'},
      {y: 'lqi', axis: 'y2', color: 'goldenrod', thickness: '2px', type: 'line', label: 'LQI'}
    ],
    lineMode: 'linear',
    tension: 0.7,
    tooltip: {
      mode: 'scrubber', formatter: function (x, y, series) {
        return y + ' @ ' + moment(x).format('HH:mm:ss');
      }
    },
    drawLegend: true,
    drawDots: false,
    hideOverflow: true,
    columnsHGap: 5
  };

  $(document).ready(function () {
    // Get the settings
    $scope.refreshSettings();
    $scope.getNetworks();

    var socket = io();
    socket.on('usbConnected', function (info) {
      console.log('USB CONNECTED');
      $scope.usbConnected = true;
      $scope.surveyReady = true;
      _.delay($scope.refreshSettings, 1000); // not all information would be available else
      $scope.$apply();
    });

    socket.on('usbDisconnected', function () {
      console.log('USB DISCONNECTED');
      $scope.usbConnected = false;
      $scope.refreshSettings();
      $scope.$apply();
    })
  });

  /**
   * Toggles measurement: on / off
   */
  $scope.toggleMeasurement = function () {
    $scope.continousScanningActive = !$scope.continousScanningActive;

    if ($scope.continousScanningActive) {
      $scope.updateCurrentNetworkData();
    }
  };

  /**
   * Returns the text for the pause/continue button
   * @returns {*}
   */
  $scope.getActionText = function () {
    if ($scope.continousScanningActive) {
      return 'Pause measurement';
    }
    return 'Continue measurement';
  };

  /**
   * Refresh the settings (and more important the current COM port)
   */
  $scope.refreshSettings = function () {
    $http.get('/settings').success(function (data) {
      if (data.status === 'ok') {
        $scope.startingUp = false;
        $scope.settings = data.settings;
        $scope.connectedSerialPort = data.serialport;
        $scope.usbDongle = data.usbDongle;
        $scope.calculateProgressBarLimits();
        if (data.serialport) {
          $scope.usbConnected = true;
          $scope.surveyReady = true;
        }
      }
    }).
      error(function (data, status) {
        $scope.startingUp = false;
        console.log('error:');
        console.log(data);
        console.log(status);
      });
  };
  /**
   * Returns the currently connected serial port
   */
  $scope.getConnectedSerialPort = function () {
    if ($scope.connectedSerialPort) {
      return $scope.connectedSerialPort.comName;
    }
    else {
      return 'NOT CONNECTED!';
    }
  };

  /**
   * Switch to the survey mode
   * @param panId
   */
  $scope.survey = function (network) {
    $scope.currentNetwork = network;
    $scope.panel = 'survey';
    $scope.measurements = [];
    $scope.continousScanningActive = true;
    $scope.networkFailureCounter = 0;
    $scope.log = [];
    $scope.updateCurrentNetworkData();
  };

  /**
   * Close survey mode
   */
  $scope.closeSurvey = function () {
    $scope.continousScanningActive = false;
    $scope.panel = 'networks';
  };

  /**
   * Add a log entry
   */
  $scope.addLog = function () {
    if ($scope.currentLocation.length > 0) {
      var entry = $scope.getLatestMeasurementEntry();
      entry.info = $scope.currentLocation;

      if (_.find($scope.log, {ts: entry.ts})) {
        console.log('entry already in log');
        return;
      }
      $scope.log.push(entry);
    }
  };
  /**
   * Returns the last entry of the measurement
   * @returns {*}
   */
  $scope.getLatestMeasurementEntry = function () {
    if ($scope.measurements.length === 0) {
      return {rssi: $scope.settings.levels.min, lqi: 0};
    }
    return _.last($scope.measurements);
  };

  /**
   * Return the class for the progressbar associated with the given rssi value
   * @param rssi
   */
  $scope.getRssiClass = function (rssi) {
    if (!$scope.settings || !$scope.settings.levels) {
      return;
    }
    if (rssi < $scope.settings.levels.acceptable) {
      return 'progress-bar-danger';
    }
    if (rssi > $scope.settings.levels.good) {
      return 'progress-bar-success'
    }
    return 'progress-bar-warning';
  };


  $scope.calculateProgressBarLimits = function () {
    if (!$scope.settings) {
      console.warn('Settings not available, can not calculate limits');
      return;
    }
    var rssiRange = Math.abs($scope.settings.levels.max - $scope.settings.levels.min);
    $scope.progressBarDangerWidth = Math.abs($scope.settings.levels.acceptable - $scope.settings.levels.min) / rssiRange * 100;
    $scope.progressBarWarningWidth = Math.abs($scope.settings.levels.good - $scope.settings.levels.acceptable) / rssiRange * 100;
    $scope.progressBarSuccessWidth = Math.abs($scope.settings.levels.max - $scope.settings.levels.good) / rssiRange * 100;
    console.log($scope.progressBarDangerWidth);
    console.log($scope.progressBarWarningWidth);
    console.log($scope.progressBarSuccessWidth);
  };
  /**
   * Shortcut for the progressbars
   * @returns {{progressBarDangerWidth, progressBarWarningWidth, progressBarSuccessWidth}}
   */
  $scope.getLatestRssiProgressbarData = function () {
    return $scope.getProgressBarWidth($scope.getLatestMeasurementEntry().rssi);
  };

  /**
   * Gets the widths of the different progressbars
   * @param rssi
   * @returns {*}
   */
  $scope.getProgressBarWidth = function (rssi) {
    if (!$scope.settings || !$scope.settings.levels) {
      return {
        progressBarDangerWidth: 0,
        progressBarWarningWidth: 0,
        progressBarSuccessWidth: 0
      };
    }
    if (rssi < $scope.settings.levels.acceptable) {
      console.log('RSSI to low');
      console.log(Math.abs(rssi - $scope.settings.levels.min) / Math.abs($scope.settings.levels.acceptable - $scope.settings.levels.min) * $scope.progressBarDangerWidth);
      console.log(Math.abs(rssi - $scope.settings.levels.min));
      console.log(Math.abs($scope.settings.levels.acceptable - $scope.settings.levels.min));
      console.log($scope.progressBarDangerWidth);
      return {
        progressBarDangerWidth: Math.abs(rssi - $scope.settings.levels.min) / Math.abs($scope.settings.levels.acceptable - $scope.settings.levels.min) * $scope.progressBarDangerWidth,
        progressBarWarningWidth: 0,
        progressBarSuccessWidth: 0
      };
    }
    if (rssi > $scope.settings.levels.good) {
      return {
        progressBarDangerWidth: $scope.progressBarDangerWidth,
        progressBarWarningWidth: $scope.progressBarWarningWidth,
        progressBarSuccessWidth: Math.abs(rssi - $scope.settings.levels.good) / Math.abs($scope.settings.levels.max- $scope.settings.levels.good) * $scope.progressBarSuccessWidth
      };
    }
    return {
      progressBarDangerWidth: $scope.progressBarDangerWidth,
      progressBarWarningWidth: Math.abs(rssi - $scope.settings.levels.acceptable) / Math.abs($scope.settings.levels.good - $scope.settings.levels.acceptable) * $scope.progressBarWarningWidth,
      progressBarSuccessWidth: 0
    };
  };

  /**
   * Get information about all networks
   */
  $scope.getNetworks = function () {
    $scope.networkScanActive = true;
    $http.get('/scan/all').
      success(function (data) {
        if (data.status === 'ok') {
          $scope.networks = data.networks
        }
        else {
          $scope.networks = [];
        }
        $scope.networkScanActive = false;

      }).
      error(function (data, status) {
        console.log('error:');
        console.log(data);
        console.log(status);
        $scope.networks = [];
        $scope.networkScanActive = false;
      });
  };

  /**
   * Calculates a percent values for RSSI (progress bar)
   * @param rssi
   * @returns {number}
   */
  $scope.calculateRssiPercent = function (rssi) {
    return 100 - Math.abs(rssi / ($scope.settings.levels.max- $scope.settings.levels.min)) * 100;
  };
  /**
   * Cancels the scanning for one single network
   */
  $scope.cancelContinousScanning = function () {
    $scope.continousScanningActive = false;
  };
  /**
   * Returns the filename for a complete file (all measurements)
   * @returns {string}
   */
  $scope.getFileNameForAllData = function () {
    var first = _.first($scope.measurements) || 'measurements';
    return moment().format('YYMMDD-HHmmss') + '-all-' + _.camelCase(first.extendedPanId).toUpperCase() + '.csv';
  };
  /**
   * Returns the filename for the log
   */
  $scope.getFileNameForLog = function () {
    var first = _.first($scope.measurements) || 'measurements';
    return moment().format('YYMMDD-HHmmss') + '-log-' + _.camelCase(first.extendedPanId).toUpperCase() + '.csv';
  };
  /**
   * Get information about all networks
   */
  $scope.updateCurrentNetworkData = function () {
    function continueAfterScan() {
      if ($scope.continousScanningActive) {
        _.delay($scope.updateCurrentNetworkData, 500);
      }
    }

    $scope.networkScanActive = true;
    $http.get('/scan/' + $scope.currentNetwork.channel + '/' + $scope.currentNetwork.panId).
      success(function (data) {
        if (data.status === 'ok') {
          if (data.networks.length > 0) {
            var m = data.networks[0];
            m.rssiPercent = $scope.calculateRssiPercent(m.rssi);
            m.lqiPercent = m.lqi / 255 * 100;
            m.ts = new Date();
            if (m.found) {
              $scope.measurements.push(m);
              $scope.networkFailureCounter = 0;
            }
            else {
              // Network not found
              $scope.networkFailureCounter++;
              if ($scope.networkFailureCounter > 2) {
                $scope.measurements.push(m);
              }
              $scope.networkFailureCounter++;
              console.log('networkFailureCounter: ' + $scope.networkFailureCounter);
            }
          }
        }
        $scope.networkScanActive = false;
        continueAfterScan();
      }).
      error(function (data, status) {
        console.log('error:');
        console.log(data);
        console.log(status);
        $scope.networkScanActive = false;
        continueAfterScan();
      });
  };

  // Warning before unloading
  window.onbeforeunload = function () {
    if ($scope.continousScanningActive) {
      return 'Measurement is in active.\n\nDo you want to cancel the measurements and leave the page?';
    }
  };

}]);


