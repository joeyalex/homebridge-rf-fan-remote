// config.json

//{
//          "accessory": "http-rf-fan-remote",
//          "name": "Power",
//	  "url": "http://ESP_869815/msg?repeat=2&rdelay=100&pdelay=1&address=16388&code=538BC81:PANASONIC:48",
//    "remote_code": "1011100101100100"  // 16 Bits
//    "dimmable": true
//    "direction": true
//        }

// Winter = Clockwise = 0
// Summer = CounterClockwise = 1


"use strict";

var debug = require('debug')('RFRemote');
var request = require("request");
var Service, Characteristic;
var os = require("os");
var hostname = os.hostname();

var fanCommands = {
  fan0: "111101",
  fan25: "110111",
  fan50: "101111",
  fan75: "101110",
  fan100: "011111",
  Down: "110011",
  lightD: "111110",
  reverse: "111011",
  forward: "111010",
  lightND: "111110",
  sync: "111111",
  header: "250",
  zero: ["300", "700"],
  one: ["700", "300"],
  winter: "10",
  summer: "00",
  pulse: 6,
  pdelay: 8,
  rdelay: 600,
  busy: 1,
  start: 25
}

module.exports = function(homebridge) {

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory("homebridge-rf-fan-remote", "RFRemote", RFRemote);
}

function RFRemote(log, config) {
  this.log = log;
  this.name = config.name;

  this.remote_code = config.remote_code;
  this.url = config.url;
  this.dimmable = config.dimmable || false;
  this.direction = false;
  this.out = config.out || 1;

  //

  if (this.dimmable) {
    fanCommands.light = fanCommands.lightD;
    fanCommands.dimmable = "1";
  } else {
    fanCommands.light = fanCommands.lightND;
    fanCommands.dimmable = "0";
  }

  // Below are the legacy settings

  this.stateful = config.stateful || false;
  this.on_busy = config.on_busy || 1;
  this.off_busy = config.off_busy || 1;
  this.down_busy = config.down_busy || 1;
  this.up_busy = config.up_busy || 1;

  this.on_data = config.on_data;
  this.off_data = config.off_data;
  this.up_data = config.up_data;
  this.down_data = config.down_data;
  this.start = config.start || undefined;
  this.steps = config.steps || 4;
  this.count = config.count || 0;

  this.working = Date.now();


  debug("Adding Fan", this.name);
  this._fan = new Service.Fan(this.name + " fan");
  this._fan.getCharacteristic(Characteristic.On)
    .on('set', this._fanOn.bind(this));

  this._fan
    .addCharacteristic(new Characteristic.RotationSpeed())
    .on('set', this._fanSpeed.bind(this))
    .setProps({
      minStep: 25
    });

  this._fan
    .addCharacteristic(new Characteristic.RotationDirection())
    .on('set', this._fanDirection.bind(this));

  this._fan.getCharacteristic(Characteristic.RotationSpeed).updateValue(fanCommands.start);

  debug("Setting direction to",this.direction);
  this._fan.getCharacteristic(Characteristic.RotationDirection).updateValue(this.direction);

  debug("Adding Light", this.name);
  this._light = new Service.Lightbulb(this.name + " light");
  this._light.getCharacteristic(Characteristic.On)
    .on('set', this._lightOn.bind(this));

  if (this.dimmable) {
    this._light
      .addCharacteristic(new Characteristic.Brightness())
      .on('set', this._lightBrightness.bind(this));
  }

  if (this.start == undefined && this.on_data && this.up_data)
    this.resetDevice();

}

RFRemote.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();

  informationService
    .setCharacteristic(Characteristic.Manufacturer, "NorthernMan54")
    .setCharacteristic(Characteristic.Model, this.service)
    .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
    .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

  return [this._fan, this._light, informationService];
}

RFRemote.prototype._fanOn = function(on, callback) {

  this.log("Setting " + this.name + " _fanOn to " + on);

  if (on) {
    // Is the fan already on?  Don't repeat command
    if (!this._fan.getCharacteristic(Characteristic.On).value) {
      this.httpRequest("toggle", this.url, _fanSpeed(this._fan.getCharacteristic(Characteristic.RotationSpeed).value), 1, fanCommands.busy, function(error, response, responseBody) {
        if (error) {
          this.log('RFRemote failed: %s', error.message);
          callback(error);
        } else {
          //  debug('RFRemote succeeded!', this.url);
          callback();
        }
      }.bind(this));
    } else {
      debug('Fan already on', this.url);
      callback();
    }
  } else {
    this.httpRequest("toggle", this.url, fanCommands.fan0, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  }
}

RFRemote.prototype._fanSpeed = function(value, callback) {

  if (value > 0) {
    this.log("Setting " + this.name + " _fanSpeed to " + value);
    this.httpRequest("toggle", this.url, _fanSpeed(value), 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  } else {
    this.log("Not setting " + this.name + " _fanSpeed to " + value);
    setTimeout(function() {
      this._fan.getCharacteristic(Characteristic.RotationSpeed).updateValue(fanCommands.start);
    }.bind(this), 100);
    callback();
  }
}

RFRemote.prototype._lightOn = function(on, callback) {

  this.log("Setting " + this.name + " _lightOn to " + on);

  if (on) {

    this.httpRequest("toggle", this.url, fanCommands.light, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  } else {
    this.httpRequest("toggle", this.url, fanCommands.light, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  }
}

RFRemote.prototype._fanDirection = function(on, callback) {

  this.log("Setting " + this.name + " _summerSetting to " + on);

  if (!on) {
    this.direction = false;
    this.httpRequest("direction", this.url, fanCommands.reverse, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  } else {
    // counterclockwise
    this.direction = true;
    this.httpRequest("direction", this.url, fanCommands.forward, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  }
}

RFRemote.prototype._lightBrightness = function(value, callback) {

  //debug("Device", this._fan);

  this.log("Setting " + this.name + " _lightBrightness to " + value);

  var current = this._fan.getCharacteristic(Characteristic.RotationSpeed)
    .value;

  if (current == undefined)
    current = this.start;

  if (value == 100 && current == 0) {
    callback(null, current);
    return;
  }

  var _value = Math.floor(value / (100 / this.steps));
  var _current = Math.floor(current / (100 / this.steps));
  var delta = Math.round(_value - _current);

  debug("Values", this.name, value, current, delta);

  if (delta < 0) {
    // Turn down device
    this.log("Turning down " + this.name + " by " + Math.abs(delta));
    this.httpRequest("down", this.url, this.down_data, Math.abs(delta) + this.count, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  } else if (delta > 0) {

    // Turn up device
    this.log("Turning up " + this.name + " by " + Math.abs(delta));
    this.httpRequest("up", this.url, this.up_data, Math.abs(delta) + this.count, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));

  } else {
    this.log("Not controlling " + this.name, value, current, delta);
    callback();
  }
}

RFRemote.prototype._setState = function(on, callback) {

  this.log("Turning " + this.name + " to " + on);

  debug("_setState", this.name, on, this._fan.getCharacteristic(Characteristic.On).value);

  if (on && !this._fan.getCharacteristic(Characteristic.On).value) {
    this.httpRequest("on", this.url, this.on_data, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        var current = this._fan.getCharacteristic(Characteristic.RotationSpeed)
          .value;
        if (current != this.start && this.start != undefined) {
          debug("Setting level after turning on ", this.start);
          this._fan.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.start);
        }
        callback();
      }
    }.bind(this));
  } else if (!on && this._fan.getCharacteristic(Characteristic.On).value) {
    this.httpRequest("off", this.url, this.off_data, 1, fanCommands.busy, function(error, response, responseBody) {
      if (error) {
        this.log('RFRemote failed: %s', error.message);
        callback(error);
      } else {
        //  debug('RFRemote succeeded!', this.url);
        callback();
      }
    }.bind(this));
  } else {
    debug("Do nothing");
    callback();
  }
}

RFRemote.prototype.resetDevice = function() {
  debug("Reseting volume on device", this.name);
  this.httpRequest("on", this.url, this.on_data, 1, fanCommands.busy, function(error, response, responseBody) {

    setTimeout(function() {
      this.httpRequest("down", this.url, this.down_data, this.steps, fanCommands.busy, function(error, response, responseBody) {

        setTimeout(function() {
          this.httpRequest("up", this.url, this.up_data, 2, fanCommands.busy, function(error, response, responseBody) {

            setTimeout(function() {
              this.httpRequest("off", this.url, this.off_data, 1, fanCommands.busy, function(error, response, responseBody) {
                this._fan.getCharacteristic(Characteristic.RotationSpeed).updateValue(2);
              }.bind(this));
            }.bind(this), fanCommands.busy);

          }.bind(this));

        }.bind(this), this.steps * fanCommands.busy);
      }.bind(this));

    }.bind(this), fanCommands.busy);
  }.bind(this));


}

RFRemote.prototype.httpRequest = function(name, url, command, count, sleep, callback) {
  //debug("url",url,"Data",data);
  // Content-Length is a workaround for a bug in both request and ESP8266WebServer - request uses lower case, and ESP8266WebServer only uses upper case

  //debug("HttpRequest", name, url, count, sleep);

  //debug("time",Date.now()," ",this.working);

  if (Date.now() > this.working) {
    //  this.working = Date.now() + sleep * count;

    var data = _buildBody(this, command);

    data[0].repeat = count;
    data[0].rdelay = fanCommands.rdelay;

    var body = JSON.stringify(data);
//    debug("Body", body);
    request({
        url: url,
        method: "POST",
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length
        },
        body: body
      },
      function(error, response, body) {
        if (response) {
          //  debug("Response", response.statusCode, response.statusMessage);
        } else {
          debug("Error", name, url, count, sleep, callback, error);
        }

        if (callback) callback(error, response, body);
      }.bind(this));

  } else {
    debug("NODEMCU is busy", name);
    if (callback) callback(new Error("Device Busy"));
  }
}

function _buildBody(that, command) {
  // This is the command structure for
  // debug("This", that);

  if (that.direction) {
    debug("CounterClockwise");
    var direction = fanCommands.winter;
  } else {
    debug("Clockwise");
    var direction = fanCommands.summer;
  }

  var remoteCommand = "0" + direction + that.remote_code + fanCommands.dimmable + command;
  debug("This is the command", _splitAt8(remoteCommand));

  var data = [];
  data.push(fanCommands.header);
  for (var x = 0; x < remoteCommand.length; x++) {
    switch (remoteCommand.charAt(x)) {
      case "0":
        for (var y = 0; y < fanCommands.zero.length; y++) {
          data.push(fanCommands.zero[y]);
        }
        break;
      case "1":
        for (var y = 0; y < fanCommands.zero.length; y++) {
          data.push(fanCommands.one[y]);
        }
        break;
      default:
        that.log("Missing 1 or 0", remoteCommand);
        break;
    }
  }

  var body = [{
    "type": "raw",
    "out": that.out,
    "khz": 500,
    "data": data,
    "pulse": fanCommands.pulse,
    "pdelay": fanCommands.pdelay
  }];
  //debug("This is the body", body);
  return body;
}

function _splitAt8(string) {
  var response = "";
  for (var x = 0; x < string.length; x++) {
    if (x % 8 === 0)
      response += " ";
    response += string.charAt(x);
  }
  return response;
}

function _fanSpeed(speed) {
  debug("Fan Speed", speed);
  var command;
  switch (true) {
    case (speed < 15):
      command = fanCommands.fan0;
      break;
    case (speed < 40):
      command = fanCommands.fan25;
      break;
    case (speed < 65):
      command = fanCommands.fan50;
      break;
    case (speed < 90):
      command = fanCommands.fan75;
      break;
    case (speed < 101):
      command = fanCommands.fan100;
      break;
  }
  return command;
}
