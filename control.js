/**
 * Balboa spa control module
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

import { EventEmitter } from "events";
import {
  ControlType,
  HeatMode,
  MessageType,
  OffOnState,
  OffLowHighState,
  OffLowMediumHighState,
  ToggleItemCode,
  UnknownState,
} from "./enums.js";

export const EVENT_UPDATE = "update";

export const FAULT_LOG_ERROR_CODES = {
  15: "Sensors are out of sync",
  16: "The water flow is low",
  17: "The water flow has failed",
  18: "The settings have been reset",
  19: "Priming Mode",
  20: "The clock has failed",
  21: "The settings have been reset",
  22: "Program memory failure",
  26: "Sensors are out of sync -- Call for service",
  27: "The heater is dry",
  28: "The heater may be dry",
  29: "The water is too hot",
  30: "The heater is too hot",
  31: "Sensor A Fault",
  32: "Sensor B Fault",
  34: "A pump may be stuck on",
  35: "Hot fault",
  36: "The GFCI test failed",
  37: "Standby Mode (Hold Mode)",
};

const CONTROL_TYPE_MAP = {
  [ControlType.PUMP]: ToggleItemCode.PUMP_1,
  [ControlType.BLOWER]: ToggleItemCode.BLOWER,
  [ControlType.MISTER]: ToggleItemCode.MISTER,
  [ControlType.LIGHT]: ToggleItemCode.LIGHT_1,
  [ControlType.AUX]: ToggleItemCode.AUX_1,
  [ControlType.CIRCULATION_PUMP]: ToggleItemCode.CIRCULATION_PUMP,
  [ControlType.TEMPERATURE_RANGE]: ToggleItemCode.TEMPERATURE_RANGE,
  [ControlType.HEAT_MODE]: ToggleItemCode.HEAT_MODE,
};

const STATE_OPTIONS_MAP = {
  2: [OffOnState.OFF, OffOnState.ON],
  3: [OffLowHighState.OFF, OffLowHighState.LOW, OffLowHighState.HIGH],
  4: [
    OffLowMediumHighState.OFF,
    OffLowMediumHighState.LOW,
    OffLowMediumHighState.MEDIUM,
    OffLowMediumHighState.HIGH,
  ],
};

/**
 * Base event mixin functionality
 */
export class EventMixin extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Register an event callback
   * @param {string} eventName - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    super.on(eventName, callback);

    return () => {
      this.removeListener(eventName, callback);
    };
  }
}

/**
 * Spa control
 */
export class SpaControl extends EventMixin {
  constructor(
    client,
    controlType,
    states = 1,
    index = null,
    customOptions = null,
  ) {
    super();

    this._client = client;
    this._controlType = controlType;
    this._index = index;
    this._name = `${controlType}${index === null ? "" : ` ${index + 1}`}`;
    this._code = CONTROL_TYPE_MAP[controlType];
    this._stateValue = UnknownState.UNKNOWN;
    this._state = UnknownState.UNKNOWN;

    if (typeof states === "number") {
      this._states = states;
      this._options = STATE_OPTIONS_MAP[states];
    } else {
      this._states = states.length;
      this._options = states;
    }

    this._customOptions = customOptions;
  }

  toString() {
    return `${this.name}: ${this.getStateName()}`;
  }

  get client() {
    return this._client;
  }

  get controlType() {
    return this._controlType;
  }

  get index() {
    return this._index;
  }

  get name() {
    return this._name;
  }

  get options() {
    return this._customOptions || [...this._options];
  }

  get state() {
    return this._state;
  }

  getStateName() {
    if (this._state === UnknownState.UNKNOWN) return "UNKNOWN";

    // Find the name in the appropriate enum
    for (const [key, value] of Object.entries(OffOnState)) {
      if (value === this._state) return key;
    }
    for (const [key, value] of Object.entries(OffLowHighState)) {
      if (value === this._state) return key;
    }
    for (const [key, value] of Object.entries(OffLowMediumHighState)) {
      if (value === this._state) return key;
    }
    for (const [key, value] of Object.entries(HeatMode)) {
      if (value === this._state) return key;
    }

    return String(this._state);
  }

  /**
   * Update the control's current state
   * @param {number} state - New state value
   */
  update(state) {
    if (this._stateValue !== state) {
      this._stateValue = state;

      // Find matching option
      const matchingOption = this._options.find((option) => option === state);

      if (matchingOption !== undefined) {
        this._state = matchingOption;
      } else if (
        this.controlType === ControlType.PUMP &&
        state >= this._states
      ) {
        this._state = this._options[this._options.length - 1];
      } else {
        this._state = UnknownState.UNKNOWN;
      }

      console.debug(
        `${this._client.host} -- ${this.name} is now ${this.getStateName()} (${state})`,
      );
      this.emit(EVENT_UPDATE);
    }
  }

  /**
   * Set control to state
   * @param {number} state - Target state
   * @returns {Promise<boolean>}
   */
  async setState(state) {
    if (!this.options.includes(state)) {
      console.error(`Cannot set state to ${state}`);
      return false;
    }

    if (this._state === state) {
      return true;
    }

    let minToggle = 1;
    if (this._state !== UnknownState.UNKNOWN) {
      minToggle = Math.max((state - this._state) % this._states, 1);
    }

    for (let i = 0; i < minToggle; i++) {
      await this._client.sendMessage(
        MessageType.TOGGLE_STATE,
        this._code + (this._index || 0),
      );
    }

    return true;
  }
}

/**
 * Heat mode spa control
 */
export class HeatModeSpaControl extends SpaControl {
  constructor(client) {
    const heatModeStates = [
      HeatMode.READY,
      HeatMode.REST,
      HeatMode.READY_IN_REST,
    ];
    super(client, ControlType.HEAT_MODE, heatModeStates, null, [
      HeatMode.READY,
      HeatMode.REST,
    ]);
  }

  async setState(state) {
    if (!this.options.includes(state)) {
      console.error(`Cannot set state to ${state}`);
      return false;
    }

    if (this._state === state) {
      return true;
    }

    const toggleCount =
      this.state === HeatMode.READY_IN_REST && state === HeatMode.READY ? 2 : 1;

    for (let i = 0; i < toggleCount; i++) {
      await this._client.sendMessage(MessageType.TOGGLE_STATE, this._code);
    }

    return true;
  }
}

/**
 * Fault log entry
 */
export class FaultLog {
  constructor(data) {
    this.count = data.count;
    this.entryNumber = data.entryNumber;
    this.messageCode = data.messageCode;
    this.daysAgo = data.daysAgo;
    this.timeHour = data.timeHour;
    this.timeMinute = data.timeMinute;
    this.flags = data.flags;
    this.targetTemperature = data.targetTemperature;
    this.sensorATemperature = data.sensorATemperature;
    this.sensorBTemperature = data.sensorBTemperature;

    // Calculate fault datetime
    const currentTime = data.currentTime || new Date();
    const faultDate = new Date(currentTime);
    faultDate.setDate(faultDate.getDate() - this.daysAgo);
    faultDate.setHours(this.timeHour, this.timeMinute, 0, 0);
    this.faultDatetime = faultDate;
  }

  get message() {
    return (
      FAULT_LOG_ERROR_CODES[this.messageCode] || `Unknown (${this.messageCode})`
    );
  }

  toString() {
    const dateStr = this.faultDatetime.toISOString().split("T")[0];
    const timeStr = this.faultDatetime
      .toTimeString()
      .split(" ")[0]
      .substring(0, 5);
    return `Fault log ${this.entryNumber + 1}/${this.count}: ${this.message} occurred on ${dateStr} at ${timeStr}`;
  }
}
