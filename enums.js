/**
 * Enums module for Balboa spa communication
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

export const MessageType = {
  DEVICE_PRESENT: 0x04,
  TOGGLE_STATE: 0x11,
  STATUS_UPDATE: 0x13,
  SET_TEMPERATURE: 0x20,
  SET_TIME: 0x21,
  REQUEST: 0x22,
  FILTER_CYCLE: 0x23,
  SYSTEM_INFORMATION: 0x24,
  SETUP_PARAMETERS: 0x25,
  PREFERENCES: 0x26,
  SET_TEMPERATURE_UNIT: 0x27,
  FAULT_LOG: 0x28,
  DEVICE_CONFIGURATION: 0x2e,
  SET_WIFI: 0x92,
  MODULE_IDENTIFICATION: 0x94,
  UNKNOWN: -1,
};

export const SettingsCode = {
  DEVICE_CONFIGURATION: 0x00,
  FILTER_CYCLE: 0x01,
  SYSTEM_INFORMATION: 0x02,
  SETUP_PARAMETERS: 0x04,
  FAULT_LOG: 0x20,
  UNKNOWN: -1,
};

export const ControlType = {
  AUX: "Aux",
  BLOWER: "Blower",
  CIRCULATION_PUMP: "Circulation pump",
  HEAT_MODE: "Heat mode",
  LIGHT: "Light",
  MISTER: "Mister",
  PUMP: "Pump",
  TEMPERATURE_RANGE: "Temperature range",
};

export const AccessibilityType = {
  PUMP_LIGHT: 0,
  NONE: 1,
  ALL: 2,
};

export const HeatState = {
  OFF: 0,
  HEATING: 1,
  HEAT_WAITING: 2,
};

export const SpaState = {
  RUNNING: 0x00,
  INITIALIZING: 0x01,
  HOLD_MODE: 0x05,
  AB_TEMPS_ON: 0x14,
  TEST_MODE: 0x17,
  UNKNOWN: -1,
};

export const TemperatureUnit = {
  FAHRENHEIT: 0,
  CELSIUS: 1,
};

export const ToggleItemCode = {
  NORMAL_OPERATION: 0x01,
  CLEAR_NOTIFICATION: 0x03,
  PUMP_1: 0x04,
  PUMP_2: 0x05,
  PUMP_3: 0x06,
  PUMP_4: 0x07,
  PUMP_5: 0x08,
  PUMP_6: 0x09,
  BLOWER: 0x0c,
  MISTER: 0x0e,
  LIGHT_1: 0x11,
  LIGHT_2: 0x12,
  LIGHT_3: 0x13,
  LIGHT_4: 0x14,
  AUX_1: 0x16,
  AUX_2: 0x17,
  SOAK_MODE: 0x1d,
  HOLD_MODE: 0x3c,
  CIRCULATION_PUMP: 0x3d,
  TEMPERATURE_RANGE: 0x50,
  HEAT_MODE: 0x51,
};

export const WiFiState = {
  OK: 0,
  SPA_NOT_COMMUNICATING: 1,
  STARTUP: 2,
  PRIME: 3,
  HOLD: 4,
  PANEL: 5,
};

export const HeatMode = {
  READY: 0,
  REST: 1,
  READY_IN_REST: 2,
};

export const LowHighRange = {
  LOW: 0,
  HIGH: 1,
};

export const OffOnState = {
  OFF: 0,
  ON: 1,
};

export const OffLowHighState = {
  OFF: 0,
  LOW: 1,
  HIGH: 2,
};

export const OffLowMediumHighState = {
  OFF: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export const UnknownState = {
  UNKNOWN: -1,
};

// Helper functions to get enum keys
export function getMessageTypeName(value) {
  return (
    Object.keys(MessageType).find((key) => MessageType[key] === value) ||
    "UNKNOWN"
  );
}

export function getSpaStateName(value) {
  return (
    Object.keys(SpaState).find((key) => SpaState[key] === value) || "UNKNOWN"
  );
}

export function getHeatStateName(value) {
  return (
    Object.keys(HeatState).find((key) => HeatState[key] === value) || "UNKNOWN"
  );
}
