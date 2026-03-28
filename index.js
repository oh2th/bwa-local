/**
 * bwa-local - Balboa spa WiFi adapter communication module
 * Node.js implementation based on pybalboa by Nathan Spencer and Tim Rightnour
 *
 * @author oh2th
 * @license Apache-2.0
 */

export { SpaClient } from "./client.js";
export { asyncDiscover, DiscoveredSpa } from "./discovery.js";
export {
  SpaControl,
  HeatModeSpaControl,
  FaultLog,
  EVENT_UPDATE,
} from "./control.js";
export {
  SpaConnectionError,
  SpaConfigurationNotLoadedError,
  SpaMessageError,
} from "./exceptions.js";
export {
  MessageType,
  SettingsCode,
  ControlType,
  AccessibilityType,
  HeatState,
  SpaState,
  TemperatureUnit,
  ToggleItemCode,
  WiFiState,
  HeatMode,
  LowHighRange,
  OffOnState,
  OffLowHighState,
  OffLowMediumHighState,
  UnknownState,
} from "./enums.js";
