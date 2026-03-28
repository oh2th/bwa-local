/**
 * Balboa spa client module
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

import net from "net";
import {
  AccessibilityType,
  ControlType,
  HeatState,
  LowHighRange,
  MessageType,
  SettingsCode,
  SpaState,
  TemperatureUnit,
  ToggleItemCode,
  WiFiState,
  getMessageTypeName,
} from "./enums.js";
import {
  SpaConnectionError,
  SpaConfigurationNotLoadedError,
  SpaMessageError,
} from "./exceptions.js";
import {
  EVENT_UPDATE,
  EventMixin,
  HeatModeSpaControl,
  SpaControl,
  FaultLog,
} from "./control.js";
import {
  byteParser,
  calculateChecksum,
  calculateTime,
  calculateTimeDifference,
  defaultValue,
  readOneMessage,
  toCelsius,
  utcNow,
  sleep,
  MESSAGE_DELIMITER,
  MESSAGE_DELIMITER_BYTE,
} from "./utils.js";
import { asyncDiscover } from "./discovery.js";

export { EVENT_UPDATE };

const DEFAULT_PORT = 4257;
const MESSAGE_SEND = [0x0a, 0xbf];

const ACCESSIBILITY_TYPE_MAP = {
  16: AccessibilityType.PUMP_LIGHT,
  32: AccessibilityType.NONE,
  48: AccessibilityType.NONE,
};

/**
 * Balboa Spa Client
 */
export class SpaClient extends EventMixin {
  constructor(host, port = DEFAULT_PORT, options = {}) {
    super();

    this._host = host;
    this._port = port;
    this._macAddress = options.macAddress || null;

    // Configuration loaded flags
    this._deviceConfigurationLoaded = false;
    this._filterCycleLoaded = false;
    this._moduleIdentificationLoaded = false;
    this._setupParametersLoaded = false;
    this._systemInformationLoaded = false;
    this._configurationLoaded = false;
    this._configurationLoadedPromise = null;
    this._configurationLoadedResolve = null;

    // Message tracking
    this._lastLogMessage = null;
    this._previousStatus = null;
    this._lastMessageReceived = null;
    this._lastMessageSent = null;

    // Connection state
    this._disconnect = false;
    this._socket = null;
    this._listener = null;
    this._connectionMonitor = null;

    // Controls
    this._controls = [
      new HeatModeSpaControl(this),
      new SpaControl(this, ControlType.TEMPERATURE_RANGE, [
        LowHighRange.LOW,
        LowHighRange.HIGH,
      ]),
    ];

    // Module identification
    this._idigiDeviceId = null;

    // System information
    this._dipSwitch = null;
    this._configurationSignature = null;
    this._currentSetup = null;
    this._heaterType = null;
    this._model = null;
    this._softwareVersion = null;

    // Status information
    this._state = SpaState.UNKNOWN;
    this._heatState = HeatState.OFF;
    this._temperature = null;
    this._targetTemperature = null;
    this._temperatureUnit = TemperatureUnit.FAHRENHEIT;
    this._temperatureRange = LowHighRange.LOW;
    this._timeHour = 0;
    this._timeMinute = 0;
    this._timeOffset = 0;
    this._is24Hour = false;
    this._wifiState = WiFiState.OK;
    this._fault = null;

    // Temperature ranges
    this._lowRange = [
      [80, 104],
      [26.5, 40],
    ]; // [Fahrenheit, Celsius]
    this._highRange = [
      [80, 104],
      [26.5, 40],
    ];
    this._pumpCount = 0;

    // Filter cycles
    this._filterCycle1Start = null;
    this._filterCycle1Duration = 0;
    this._filterCycle1End = null;
    this._filterCycle1Running = false;
    this._filterCycle2Enabled = false;
    this._filterCycle2Start = null;
    this._filterCycle2Duration = 0;
    this._filterCycle2End = null;
    this._filterCycle2Running = false;
  }

  // Properties
  get host() {
    return this._host;
  }
  get port() {
    return this._port;
  }
  get connected() {
    return this._socket && !this._socket.destroyed;
  }

  get macAddress() {
    return this._requireConfigured(this._macAddress);
  }
  get model() {
    return this._requireConfigured(this._model);
  }
  get softwareVersion() {
    return this._softwareVersion;
  }
  get idigiDeviceId() {
    return this._idigiDeviceId;
  }

  get state() {
    return this._state;
  }
  get heatState() {
    return this._heatState;
  }
  get temperature() {
    return this._temperature;
  }
  get targetTemperature() {
    return this._requireConfigured(this._targetTemperature);
  }
  get temperatureUnit() {
    return this._temperatureUnit;
  }
  get temperatureRange() {
    return this._temperatureRange;
  }
  get wifiState() {
    return this._wifiState;
  }
  get fault() {
    return this._fault;
  }

  get temperatureMinimum() {
    const validTemps =
      this._temperatureRange === LowHighRange.LOW
        ? this._lowRange
        : this._highRange;
    return validTemps[this._temperatureUnit][0];
  }

  get temperatureMaximum() {
    const validTemps =
      this._temperatureRange === LowHighRange.LOW
        ? this._lowRange
        : this._highRange;
    return validTemps[this._temperatureUnit][1];
  }

  get controls() {
    return this._controls;
  }
  get pumpCount() {
    return this._pumpCount;
  }

  get filterCycle1Start() {
    return this._filterCycle1Start;
  }
  get filterCycle1Duration() {
    return this._filterCycle1Duration;
  }
  get filterCycle1End() {
    return this._filterCycle1End;
  }
  get filterCycle1Running() {
    return this._filterCycle1Running;
  }

  get filterCycle2Enabled() {
    return this._filterCycle2Enabled;
  }
  get filterCycle2Start() {
    return this._filterCycle2Start;
  }
  get filterCycle2Duration() {
    return this._filterCycle2Duration;
  }
  get filterCycle2End() {
    return this._filterCycle2End;
  }
  get filterCycle2Running() {
    return this._filterCycle2Running;
  }

  get timeHour() {
    return this._timeHour;
  }
  get timeMinute() {
    return this._timeMinute;
  }
  get is24Hour() {
    return this._is24Hour;
  }

  _requireConfigured(value) {
    if (value === null || value === undefined) {
      throw new SpaConfigurationNotLoadedError();
    }
    return value;
  }

  getCurrentTime() {
    if (this._timeHour === null || this._timeMinute === null) {
      return null;
    }
    const now = new Date();
    const deviceTime = new Date(now);
    deviceTime.setHours(this._timeHour, this._timeMinute, 0, 0);
    return deviceTime;
  }

  /**
   * Wait for configuration to be loaded
   * @param {number} timeout - Timeout in seconds (default: 15)
   * @returns {Promise<boolean>}
   */
  async asyncConfigurationLoaded(timeout = 15) {
    if (this._configurationLoaded) {
      return true;
    }

    if (!this._configurationLoadedPromise) {
      this._configurationLoadedPromise = new Promise((resolve) => {
        this._configurationLoadedResolve = resolve;
      });
    }

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(false), timeout * 1000);
    });

    return Promise.race([this._configurationLoadedPromise, timeoutPromise]);
  }

  _checkConfigurationLoaded() {
    if (
      this._deviceConfigurationLoaded &&
      this._filterCycleLoaded &&
      this._moduleIdentificationLoaded &&
      this._setupParametersLoaded &&
      this._systemInformationLoaded &&
      this._previousStatus
    ) {
      this._parseStatusUpdate(this._previousStatus, true);
      this._configurationLoaded = true;

      if (this._configurationLoadedResolve) {
        this._configurationLoadedResolve(true);
      }
    }
  }

  /**
   * Connect to the spa
   * @returns {Promise<boolean>}
   */
  async connect() {
    this._disconnect = false;
    return this._connect();
  }

  async _connect() {
    if (this.connected) {
      console.debug(`${this._host} -- already connected`);
      return true;
    }

    if (this._disconnect) {
      console.debug(
        `${this._host} -- connect skipped due to previous disconnect request`,
      );
      return false;
    }

    console.debug(`${this._host} -- establishing connection`);

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        console.error(`${this._host} ## cannot connect: Timed out`);
        resolve(false);
      }, 10000);

      socket.connect(this._port, this._host, () => {
        clearTimeout(timeout);
        console.debug(`${this._host} -- connected`);
        this._socket = socket;

        this._startListener();
        this.requestAllConfiguration(true);

        // Start connection monitor
        this._startConnectionMonitor();

        resolve(true);
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`${this._host} ## error connecting:`, err.message);
        resolve(false);
      });
    });
  }

  /**
   * Disconnect from the spa
   */
  async disconnect() {
    console.debug(`${this._host} -- disconnect requested`);
    this._disconnect = true;

    if (this._connectionMonitor) {
      clearInterval(this._connectionMonitor);
      this._connectionMonitor = null;
    }

    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }

    console.debug(`${this._host} -- disconnected`);
  }

  _startConnectionMonitor() {
    let attempt = 0;

    this._connectionMonitor = setInterval(async () => {
      if (this._disconnect) {
        clearInterval(this._connectionMonitor);
        return;
      }

      if (!this.connected) {
        if (!(await this._connect())) {
          const delay = Math.min(
            1000 * Math.pow(2, attempt) + Math.random() * 1000,
            60000,
          );
          await sleep(delay);
          attempt++;
        } else {
          attempt = 0;
        }
      }
    }, 1000);
  }

  _startListener() {
    const timeout = 15;
    const waitTime = timeout * 1000;

    const readMessages = async () => {
      while (this.connected) {
        try {
          const data = await readOneMessage(this._socket, timeout);
          this._processMessage(data);
        } catch (err) {
          if (err instanceof SpaMessageError) {
            console.debug(`${this._host} ## ${err.message}`);
            continue;
          }

          if (err.message.includes("Timeout")) {
            const sent = this._lastMessageSent;
            if (!sent || Date.now() - sent.getTime() > waitTime) {
              this.emit(EVENT_UPDATE);
              await this.sendDevicePresent();
            }
            continue;
          }

          console.error(`${this._host} ##`, err);
          break;
        }
      }

      this.emit(EVENT_UPDATE);
      console.debug(`${this._host} -- stopped listening`);
    };

    readMessages();
  }

  _processMessage(data) {
    this._lastMessageReceived = utcNow();
    const messageType = this._logMessage(data);
    const messageData = data.slice(4, -1);

    switch (messageType) {
      case MessageType.STATUS_UPDATE:
        this._parseStatusUpdate(messageData);
        break;
      case MessageType.MODULE_IDENTIFICATION:
        this._parseModuleIdentification(messageData);
        break;
      case MessageType.FILTER_CYCLE:
        this._parseFilterCycle(messageData);
        break;
      case MessageType.FAULT_LOG:
        this._parseFaultLog(messageData);
        break;
      case MessageType.DEVICE_CONFIGURATION:
        this._parseDeviceConfiguration(messageData);
        break;
      case MessageType.SETUP_PARAMETERS:
        this._parseSetupParameters(messageData);
        break;
      case MessageType.SYSTEM_INFORMATION:
        this._parseSystemInformation(messageData);
        break;
    }
  }

  _logMessage(data) {
    const messageType = data[3];
    this._lastLogMessage = data;

    const messageTypeName = getMessageTypeName(messageType);
    console.debug(
      `${this._host} -> ${messageTypeName}: ${data.toString("hex")}`,
    );

    return messageType;
  }

  _parseDeviceConfiguration(data) {
    if (!this._deviceConfigurationLoaded && data.length >= 6) {
      const addControls = (controlType, onStates) => {
        onStates.forEach((state, index) => {
          if (state > 0) {
            const controlIndex =
              onStates.filter((s) => s > 0).length > 1 ? index : null;
            this._controls.push(
              new SpaControl(this, controlType, state + 1, controlIndex),
            );
          }
        });
      };

      const pumps = [
        ...byteParser(data[0], 0, 4, 2), // pumps 1-4
        data[1] & 0x03, // pump 5
        (data[1] >> 6) & 0x03, // pump 6
        (data[1] >> 4) & 0x03, // pump 7
        (data[1] >> 2) & 0x03, // pump 8
      ];

      const lights = byteParser(data[2], 0, 4, 2);
      const circulationPump = data[3] >> 7;
      const blowers = byteParser(data[3], 0, 2, 2);
      const auxs = byteParser(data[4], 0, 4);
      const misters = byteParser(data[4], 4, 3);

      if (pumps.some((p) => p > 0)) addControls(ControlType.PUMP, pumps);
      if (lights.some((l) => l > 0)) addControls(ControlType.LIGHT, lights);
      if (circulationPump > 0)
        addControls(ControlType.CIRCULATION_PUMP, [circulationPump]);
      if (blowers.some((b) => b > 0)) addControls(ControlType.BLOWER, blowers);
      if (auxs.some((a) => a > 0)) addControls(ControlType.AUX, auxs);
      if (misters.some((m) => m > 0)) addControls(ControlType.MISTER, misters);

      this._deviceConfigurationLoaded = true;
      this._checkConfigurationLoaded();
    }
  }

  _parseFaultLog(data) {
    if (data.length >= 10) {
      this._fault = new FaultLog({
        count: data[0],
        entryNumber: data[1],
        messageCode: data[2],
        daysAgo: data[3],
        timeHour: data[4],
        timeMinute: data[5],
        flags: data[6],
        targetTemperature: data[7],
        sensorATemperature: data[8],
        sensorBTemperature: data[9],
        currentTime: this.getCurrentTime(),
      });
    }
  }

  _parseFilterCycle(data) {
    if (data.length >= 8) {
      this._filterCycle1Start = { hour: data[0], minute: data[1] };
      this._filterCycle1Duration = data[2] * 60 + data[3]; // minutes
      this._filterCycle1End = calculateTime(
        this._filterCycle1Start,
        this._filterCycle1Duration,
      );

      this._filterCycle2Enabled = Boolean(data[4] >> 7);
      this._filterCycle2Start = { hour: data[4] & 0x7f, minute: data[5] };
      this._filterCycle2Duration = data[6] * 60 + data[7]; // minutes
      this._filterCycle2End = calculateTime(
        this._filterCycle2Start,
        this._filterCycle2Duration,
      );

      this._filterCycleLoaded = true;
      this._checkConfigurationLoaded();
    }
  }

  _parseModuleIdentification(data) {
    if (data.length >= 25) {
      this._macAddress = Array.from(data.slice(3, 9))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(":");

      const idigiParts = [];
      for (let i = 9; i < 25; i += 4) {
        idigiParts.push(data.slice(i, i + 4).toString("hex"));
      }
      this._idigiDeviceId = idigiParts.join("-").toUpperCase();

      this._moduleIdentificationLoaded = true;
      this._checkConfigurationLoaded();
    }
  }

  _parseSetupParameters(data) {
    if (!this._setupParametersLoaded && data.length >= 9) {
      const lowMin = data[2];
      const lowMax = data[3];
      this._lowRange = [
        [lowMin, lowMax],
        [toCelsius(lowMin), toCelsius(lowMax)],
      ];

      const highMin = data[4];
      const highMax = data[5];
      this._highRange = [
        [highMin, highMax],
        [toCelsius(highMin), toCelsius(highMax)],
      ];

      this._pumpCount = byteParser(data[7]).reduce((sum, bit) => sum + bit, 0);

      this._setupParametersLoaded = true;
      this._checkConfigurationLoaded();
    }
  }

  _parseSystemInformation(data) {
    if (data.length >= 21) {
      this._softwareVersion = `M${data[0]}_${data[1]} V${data[2]}.${data[3]}`;
      this._model = String.fromCharCode(...data.slice(4, 12)).trim();
      this._currentSetup = data[12];
      this._configurationSignature = data
        .slice(13, 17)
        .toString("hex")
        .toUpperCase();

      const voltage = data[17];
      this._heaterType =
        data[18] === 0x0a ? "standard" : `unknown(0x${data[18].toString(16)})`;
      this._dipSwitch = `${data[19].toString(2).padStart(8, "0")}${data[20].toString(2).padStart(8, "0")}`;

      this._systemInformationLoaded = true;
      this._checkConfigurationLoaded();
    }
  }

  _parseStatusUpdate(data, reprocess = false) {
    if (
      data.equals &&
      this._previousStatus &&
      data.equals(this._previousStatus) &&
      !reprocess
    ) {
      return;
    }

    this._previousStatus = data;
    this._state = data[0];
    this._timeHour = data[3];
    this._timeMinute = data[4];

    if (!reprocess) {
      const now = new Date();
      const deviceTime = new Date(now);
      deviceTime.setHours(this._timeHour, this._timeMinute, 0, 0);
      this._timeOffset = deviceTime.getTime() - now.getTime();
    }

    const byte9 = data[9];
    this._temperatureUnit = byte9 & 0x01;
    this._is24Hour = Boolean((byte9 >> 1) & 0x01);

    const byte10 = data[10];
    this._temperatureRange = (byte10 >> 2) & 0x01;
    this._heatState = (byte10 >> 4) & 0x03;

    // Temperature processing
    const tempValue = data[2];
    if (tempValue !== 255) {
      this._temperature =
        this._temperatureUnit === TemperatureUnit.CELSIUS
          ? tempValue / 2.0
          : tempValue;
    } else {
      this._temperature = null;
    }

    const targetTempValue = data[20];
    this._targetTemperature =
      this._temperatureUnit === TemperatureUnit.CELSIUS
        ? targetTempValue / 2.0
        : targetTempValue;

    // WiFi state
    this._wifiState = data[22];

    // Update controls
    this._updateControlStates(data);

    this.emit(EVENT_UPDATE);
  }

  _updateControlStates(data) {
    // Update pump states
    const pumps = byteParser(data[11], 0, 4, 2).concat([
      data[12] & 0x03,
      (data[12] >> 6) & 0x03,
      (data[12] >> 4) & 0x03,
      (data[12] >> 2) & 0x03,
    ]);

    // Update light states
    const lights = byteParser(data[14], 0, 4, 2);

    // Circulation pump and blower
    const circulationPump = data[13] >> 7;
    const blowers = byteParser(data[13], 0, 2, 2);

    // Aux and mister
    const auxs = byteParser(data[15], 0, 4);
    const misters = byteParser(data[15], 4, 3);

    // Apply states to controls
    this._controls.forEach((control) => {
      if (control.controlType === ControlType.PUMP && control.index !== null) {
        control.update(pumps[control.index]);
      } else if (
        control.controlType === ControlType.LIGHT &&
        control.index !== null
      ) {
        control.update(lights[control.index]);
      } else if (control.controlType === ControlType.CIRCULATION_PUMP) {
        control.update(circulationPump);
      } else if (
        control.controlType === ControlType.BLOWER &&
        control.index !== null
      ) {
        control.update(blowers[control.index]);
      } else if (
        control.controlType === ControlType.AUX &&
        control.index !== null
      ) {
        control.update(auxs[control.index]);
      } else if (
        control.controlType === ControlType.MISTER &&
        control.index !== null
      ) {
        control.update(misters[control.index]);
      }
    });
  }

  /**
   * Request all configuration
   * @param {boolean} wait - Wait for responses
   */
  async requestAllConfiguration(wait = false) {
    if (!this._moduleIdentificationLoaded || !wait) {
      await this.requestModuleIdentification();
    }
    if (!this._systemInformationLoaded || !wait) {
      await this.requestSystemInformation();
    }
    if (!this._setupParametersLoaded || !wait) {
      await this.requestSetupParameters();
    }
    if (!this._deviceConfigurationLoaded || !wait) {
      await this.requestDeviceConfiguration();
    }
    if (!this._filterCycleLoaded || !wait) {
      await this.requestFilterCycle();
    }
    if (wait && !(await this.asyncConfigurationLoaded(3))) {
      if (this.connected) {
        await this.requestAllConfiguration(wait);
      }
    }
  }

  async requestDeviceConfiguration() {
    await this.sendMessage(
      MessageType.REQUEST,
      SettingsCode.DEVICE_CONFIGURATION,
      0x00,
      0x01,
    );
  }

  async requestFaultLog(entry = 0xff) {
    if (!((entry >= 0 && entry < 24) || entry === 0xff)) {
      throw new Error(
        `Invalid fault log entry: ${entry} (expected 0–23 or 0xFF for the last fault)`,
      );
    }
    await this.sendMessage(
      MessageType.REQUEST,
      SettingsCode.FAULT_LOG,
      entry % 256,
      0x00,
    );
  }

  async requestFilterCycle() {
    await this.sendMessage(
      MessageType.REQUEST,
      SettingsCode.FILTER_CYCLE,
      0x00,
      0x00,
    );
  }

  async requestModuleIdentification() {
    await this.sendDevicePresent();
  }

  async requestSetupParameters() {
    await this.sendMessage(
      MessageType.REQUEST,
      SettingsCode.SETUP_PARAMETERS,
      0x00,
      0x00,
    );
  }

  async requestSystemInformation() {
    await this.sendMessage(
      MessageType.REQUEST,
      SettingsCode.SYSTEM_INFORMATION,
      0x00,
      0x00,
    );
  }

  async sendDevicePresent() {
    await this.sendMessage(MessageType.DEVICE_PRESENT);
  }

  async sendMessage(messageType, ...message) {
    if (!this.connected) {
      return;
    }

    const prefix = messageType ? [...MESSAGE_SEND, messageType] : [];
    const messageData = [...prefix, ...message];
    const messageLength = messageData.length + 2;
    const data = Buffer.alloc(messageLength + 2);

    data[0] = MESSAGE_DELIMITER;
    data[1] = messageLength;
    data.set(messageData, 2);
    data[messageLength] = calculateChecksum(data.slice(1, messageLength));
    data[messageLength + 1] = MESSAGE_DELIMITER;

    const messageTypeName = getMessageTypeName(messageType);
    const settingsSuffix =
      messageType === MessageType.REQUEST
        ? `_${Object.keys(SettingsCode).find((k) => SettingsCode[k] === data[5]) || "UNKNOWN"}`
        : "";

    console.debug(
      `${this._host} <- ${messageTypeName}${settingsSuffix}: ${data.slice(1, -1).toString("hex")}`,
    );

    try {
      this._socket.write(data);
      this._lastMessageSent = utcNow();
    } catch (err) {
      console.error(`${this._host} ## error sending message:`, err);
    }
  }

  async setTemperature(temperature) {
    const validTemps =
      this._temperatureRange === LowHighRange.LOW
        ? this._lowRange
        : this._highRange;
    const [low, high] = validTemps[this._temperatureUnit];

    if (temperature < low || temperature > high) {
      throw new Error(
        `Invalid temperature: ${temperature} (expected ${low}..${high})`,
      );
    }

    let temp = temperature;
    if (this._temperatureUnit === TemperatureUnit.CELSIUS) {
      temp *= 2;
    }

    await this.sendMessage(MessageType.SET_TEMPERATURE, Math.floor(temp));
  }

  async setTemperatureRange(temperatureRange) {
    if (this._temperatureRange === temperatureRange) {
      return;
    }
    await this.sendMessage(
      MessageType.TOGGLE_STATE,
      ToggleItemCode.TEMPERATURE_RANGE,
    );
  }

  async setTime(hour, minute, is24Hour = null) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(`Invalid time format: ${hour}:${minute}`);
    }

    if (is24Hour === null) {
      is24Hour = this._is24Hour;
    }

    await this.sendMessage(
      MessageType.SET_TIME,
      (is24Hour ? 0x80 : 0) | hour,
      minute,
    );
  }

  /**
   * Discover spas on the network
   * @param {boolean} returnOnceFound - Return immediately after finding first spa
   * @param {number} timeout - Timeout in seconds (default: 10)
   * @returns {Promise<Array<SpaClient>>}
   */
  static async discover(returnOnceFound = false, timeout = 10) {
    const spas = await asyncDiscover(returnOnceFound, timeout);
    return spas.map(
      (spa) =>
        new SpaClient(spa.address, DEFAULT_PORT, {
          macAddress: spa.macAddress,
        }),
    );
  }
}
