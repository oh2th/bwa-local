/**
 * Balboa spa discovery module
 * Based on pybalboa by Nathan Spencer and Tim Rightnour
 */

import dgram from "dgram";
import { EventEmitter } from "events";

const BROADCAST_ADDRESS = "255.255.255.255";
const BROADCAST_PORT = 30303;
const BROADCAST_MESSAGE = Buffer.from("Discovery");
const BROADCAST_INTERVAL = 3000; // milliseconds

/**
 * Discovered spa information
 */
export class DiscoveredSpa {
  constructor(address, port, macAddress, hostname) {
    this.address = address;
    this.port = port;
    this.macAddress = macAddress;
    this.hostname = hostname;
  }

  equals(other) {
    return (
      this.address === other.address &&
      this.port === other.port &&
      this.macAddress === other.macAddress
    );
  }

  toString() {
    return `DiscoveredSpa(${this.address}:${this.port}, ${this.macAddress}, ${this.hostname})`;
  }
}

/**
 * Discover spas on the network
 * @param {boolean} returnOnceFound - Return immediately after finding first spa
 * @param {number} timeout - Timeout in seconds (default: 10)
 * @returns {Promise<Array<DiscoveredSpa>>}
 */
export async function asyncDiscover(returnOnceFound = false, timeout = 10) {
  return new Promise((resolve, reject) => {
    const spas = [];
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let broadcastInterval = null;
    let timeoutId = null;
    let discoveryComplete = false;

    const cleanup = () => {
      if (broadcastInterval) {
        clearInterval(broadcastInterval);
        broadcastInterval = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (!discoveryComplete) {
        discoveryComplete = true;
        socket.close();
      }
    };

    const broadcast = () => {
      if (returnOnceFound && spas.length > 0) {
        cleanup();
        resolve(spas);
        return;
      }

      socket.send(
        BROADCAST_MESSAGE,
        BROADCAST_PORT,
        BROADCAST_ADDRESS,
        (err) => {
          if (err) {
            console.debug("UDP discovery broadcast error:", err);
          } else {
            console.debug("UDP discovery broadcast sent");
          }
        },
      );
    };

    socket.on("error", (err) => {
      cleanup();
      reject(err);
    });

    socket.on("message", (msg, rinfo) => {
      console.debug(
        `Received response from ${rinfo.address}: ${msg.toString()}`,
      );

      const data = msg.toString().toUpperCase();
      if (!data.includes("BWGS")) {
        return; // Unexpected response, ignore
      }

      try {
        const lines = msg.toString().trim().split("\n");
        const hostname = lines[0]?.trim() || "";
        const mac = lines[1]?.trim() || "";

        const spa = new DiscoveredSpa(rinfo.address, rinfo.port, mac, hostname);

        // Check if already in list
        const exists = spas.some((s) => s.equals(spa));
        if (!exists) {
          spas.push(spa);
          console.debug(`Found spa: ${spa}`);

          if (returnOnceFound) {
            cleanup();
            resolve(spas);
          }
        }
      } catch (err) {
        console.debug("Error parsing spa response:", err);
      }
    });

    socket.on("listening", () => {
      socket.setBroadcast(true);
      console.debug("Discovery socket listening");

      // Start broadcasting
      broadcast();
      broadcastInterval = setInterval(broadcast, BROADCAST_INTERVAL);

      // Set timeout
      timeoutId = setTimeout(() => {
        console.debug("Discovery timed out");
        cleanup();
        resolve(spas);
      }, timeout * 1000);
    });

    socket.bind();
  });
}
