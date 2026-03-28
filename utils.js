/**
 * Utilities module for Balboa spa communication
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

import { SpaMessageError } from "./exceptions.js";

export const MESSAGE_DELIMITER_BYTE = Buffer.from([0x7e]); // ~
export const MESSAGE_DELIMITER = 0x7e;

/**
 * Parse a byte into an array of values
 * @param {number} value - The byte value to parse
 * @param {number} offset - Bit offset (default: 0)
 * @param {number} count - Number of values to extract (default: 8)
 * @param {number} bits - Bits per value (default: 1)
 * @param {Function} fn - Transform function (default: identity)
 * @returns {Array<number>}
 */
export function byteParser(
  value,
  offset = 0,
  count = 8,
  bits = 1,
  fn = (x) => x,
) {
  const result = [];
  const mask = parseInt("0b" + "1".repeat(bits), 2);

  for (let i = 0; i < count; i++) {
    result.push(fn((value >> (i * bits + offset)) & mask));
  }

  return result;
}

/**
 * Calculate the checksum byte for a message
 * @param {Buffer} data - The message data
 * @returns {number} The checksum byte
 */
export function calculateChecksum(data) {
  let crc = 0xb5;

  for (let cur of data) {
    for (let i = 0; i < 8; i++) {
      const bit = crc & 0x80;
      crc = ((crc << 1) & 0xff) | ((cur >> (7 - i)) & 0x01);
      if (bit) {
        crc = crc ^ 0x07;
      }
    }
    crc &= 0xff;
  }

  for (let i = 0; i < 8; i++) {
    const bit = crc & 0x80;
    crc = (crc << 1) & 0xff;
    if (bit) {
      crc ^= 0x07;
    }
  }

  return crc ^ 0x02;
}

/**
 * Calculate the time after adding a duration to a base time
 * @param {Object} baseTime - Base time {hour, minute}
 * @param {number} durationMinutes - Duration in minutes
 * @returns {Object|null} Time {hour, minute} or null
 */
export function calculateTime(baseTime, durationMinutes = 0) {
  if (!baseTime) {
    return null;
  }

  const totalMinutes =
    (baseTime.hour * 60 + baseTime.minute + durationMinutes) % (24 * 60);
  return {
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
  };
}

/**
 * Calculate the difference (in minutes) between a start and end time
 * @param {Object} start - Start time {hour, minute}
 * @param {Object} end - End time {hour, minute}
 * @returns {number} Difference in minutes
 */
export function calculateTimeDifference(start, end) {
  return (
    ((end.hour - start.hour) * 60 + (end.minute - start.minute)) % (24 * 60)
  );
}

/**
 * Return value if not null/undefined, else default
 * @param {*} value - Value to check
 * @param {*} defaultValue - Default value or function
 * @returns {*}
 */
export function defaultValue(value, defaultValue) {
  if (value !== null && value !== undefined) {
    return value;
  }
  return typeof defaultValue === "function" ? defaultValue() : defaultValue;
}

/**
 * Read one complete message from a stream
 * @param {net.Socket} socket - The socket to read from
 * @param {number} timeout - Timeout in seconds (default: 15)
 * @returns {Promise<Buffer>} The message data
 */
export async function readOneMessage(socket, timeout = 15) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timeout reading message"));
    }, timeout * 1000);

    let buffer = Buffer.alloc(0);
    let expectedLength = null;

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Look for message delimiter
      while (buffer.length >= 2) {
        if (buffer[0] !== MESSAGE_DELIMITER || buffer[1] === 0) {
          // Invalid start, find next delimiter
          const nextDelim = buffer.indexOf(MESSAGE_DELIMITER, 1);
          if (nextDelim === -1) {
            buffer = Buffer.alloc(0);
            return;
          }
          buffer = buffer.slice(nextDelim);
          continue;
        }

        expectedLength = buffer[1];

        if (buffer.length >= expectedLength + 2) {
          clearTimeout(timeoutId);
          socket.removeListener("data", onData);

          const data = buffer.slice(1, expectedLength + 1);

          if (data[0] !== data.length) {
            reject(
              new SpaMessageError(
                `Incomplete message: ${data.toString("hex")}`,
              ),
            );
            return;
          }

          const checksum = data[data.length - 1];
          const calculatedChecksum = calculateChecksum(data.slice(0, -1));

          if (calculatedChecksum !== checksum) {
            reject(
              new SpaMessageError(`Invalid checksum: ${data.toString("hex")}`),
            );
            return;
          }

          resolve(data);
          return;
        }

        break;
      }
    };

    socket.on("data", onData);
  });
}

/**
 * Convert Fahrenheit to Celsius
 * @param {number} fahrenheit - Temperature in Fahrenheit
 * @returns {number} Temperature in Celsius (rounded to 0.5)
 */
export function toCelsius(fahrenheit) {
  return 0.5 * Math.round((fahrenheit - 32) / 1.8 / 0.5);
}

/**
 * Get current UTC timestamp
 * @returns {Date}
 */
export function utcNow() {
  return new Date();
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
