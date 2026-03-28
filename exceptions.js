/**
 * Custom exceptions for Balboa spa communication
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

export class SpaConnectionError extends Error {
  constructor(message = "Spa connection could not be established") {
    super(message);
    this.name = "SpaConnectionError";
  }
}

export class SpaConfigurationNotLoadedError extends Error {
  constructor(
    message = "Spa configuration not loaded. Wait for asyncConfigurationLoaded() to complete before proceeding.",
  ) {
    super(message);
    this.name = "SpaConfigurationNotLoadedError";
  }
}

export class SpaMessageError extends Error {
  constructor(message = "Spa message is invalid") {
    super(message);
    this.name = "SpaMessageError";
  }
}
