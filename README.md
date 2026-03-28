# bwa-local

Node.js module to communicate with a Balboa spa WiFi adapter.

This is a Node.js implementation based on [pybalboa](https://github.com/garbled1/pybalboa) by Nathan Spencer and Tim Rightnour.

## Installation

```bash
npm install @oh2th/bwa-local
```

If you are installing from GitHub Packages, configure npm auth first:

```bash
echo "@oh2th:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

## Usage

### Discovery

```javascript
import { asyncDiscover } from "bwa-local";

// Discover all spas on the network
const spas = await asyncDiscover(false, 10);
console.log(`Found ${spas.length} spa(s)`);

spas.forEach((spa) => {
  console.log(`Spa at ${spa.address}:${spa.port}`);
  console.log(`MAC: ${spa.macAddress}`);
  console.log(`Hostname: ${spa.hostname}`);
});

// Or discover and return immediately after finding the first spa
const firstSpa = await asyncDiscover(true, 10);
```

### Connecting to a Spa

```javascript
import { SpaClient } from "bwa-local";

const spa = new SpaClient("192.168.1.100");

// Connect and wait for configuration to load
await spa.connect();
await spa.asyncConfigurationLoaded(15);

console.log(`Model: ${spa.model}`);
console.log(`Software Version: ${spa.softwareVersion}`);
console.log(
  `Current Temperature: ${spa.temperature}°${spa.temperatureUnit ? "C" : "F"}`,
);
console.log(
  `Target Temperature: ${spa.targetTemperature}°${spa.temperatureUnit ? "C" : "F"}`,
);

// Listen for updates
spa.on("update", () => {
  console.log(`Temperature: ${spa.temperature}`);
});

// Set temperature
await spa.setTemperature(102);

// Control pumps
for (const control of spa.controls) {
  console.log(control.toString());

  // Toggle a control
  if (control.name.includes("Pump")) {
    await control.setState(1); // Turn on
  }
}

// Disconnect when done
await spa.disconnect();
```

### Using Discovery with SpaClient

```javascript
import { SpaClient } from "bwa-local";

// Discover and create SpaClient instances
const clients = await SpaClient.discover(true, 10);

if (clients.length > 0) {
  const spa = clients[0];
  await spa.connect();
  await spa.asyncConfigurationLoaded();

  console.log(`Connected to ${spa.model}`);
}
```

## API Reference

### SpaClient

Main class for communicating with a Balboa spa.

#### Constructor

```javascript
new SpaClient(host, (port = 4257), (options = {}));
```

- `host`: IP address of the spa
- `port`: Port number (default: 4257)
- `options.macAddress`: Optional MAC address

#### SpaClient Properties

- `host`: Spa IP address
- `connected`: Connection status
- `model`: Spa model name
- `softwareVersion`: Software version
- `macAddress`: MAC address
- `temperature`: Current temperature
- `targetTemperature`: Target temperature
- `temperatureUnit`: Temperature unit (0=Fahrenheit, 1=Celsius)
- `heatState`: Current heat state
- `state`: Spa state
- `controls`: Array of available controls
- `filterCycle1Start`, `filterCycle1Duration`, etc.: Filter cycle information

#### SpaClient Methods

- `async connect()`: Connect to the spa
- `async disconnect()`: Disconnect from the spa
- `async asyncConfigurationLoaded(timeout)`: Wait for configuration to load
- `async setTemperature(temperature)`: Set target temperature
- `async setTime(hour, minute, is24Hour)`: Set spa time
- `async requestFaultLog(entry)`: Request fault log
- `static async discover(returnOnceFound, timeout)`: Discover spas on network

#### Events

- `update`: Emitted when spa status changes

### asyncDiscover()

```javascript
asyncDiscover((returnOnceFound = false), (timeout = 10));
```

Discover spas on the local network.

- `returnOnceFound`: Return immediately after finding first spa
- `timeout`: Discovery timeout in seconds
- Returns: `Promise<Array<DiscoveredSpa>>`

### SpaControl

Represents a spa control (pump, light, blower, etc.)

#### SpaControl Properties

- `name`: Control name
- `state`: Current state
- `options`: Available states

#### SpaControl Methods

- `async setState(state)`: Set control state

## Examples

See the `node-tests/` directory for complete examples:

- `test-discovery.js`: Network discovery
- `test-live-spa-analysis.js`: Comprehensive spa analysis
- `test-connect-and-generate-fixture.js`: Connect and capture messages

## License

Apache License 2.0

This is a derivative work based on [pybalboa](https://github.com/garbled1/pybalboa):

- Original Authors: Nathan Spencer, Tim Rightnour
- Node.js Implementation: oh2th

## Protocol

The Balboa spa protocol uses TCP port 4257 for control and UDP port 30303 for discovery. For more information about the protocol, see:

- [Balboa Worldwide App Wiki](https://github.com/ccutrer/balboa_worldwide_app/wiki)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Publishing

This package is configured to publish to GitHub Packages.

1. Create a GitHub token with `write:packages` and `repo` scopes.
1. Set your local npm auth token:

```bash
export NODE_AUTH_TOKEN=YOUR_GITHUB_TOKEN
```

1. Publish:

```bash
npm publish
```

Publishing from CI is also supported through `.github/workflows/publish.yml`.
