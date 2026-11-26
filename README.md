# Order.me Garment Network Simulation

Order.me is a browser-based multi-agent simulation of a garment factory. It models customer orders, production planning, staffing, inventory, logistics, deliveries, and agent communication.

## Prerequisites

- Node.js 20 or newer
- npm (included with Node.js)
- A modern browser, such as Chrome, Edge, or Firefox

Check the installed versions:

```powershell
node --version
npm --version
```

## Run locally

1. Open PowerShell in the repository root.
2. Start the web server:

```powershell
npm start
```

3. Open <http://localhost:3000> in a browser.

Keep the terminal open while using the website. Press `Ctrl+C` to stop the server.

The project uses Node.js built-in modules. There are no third-party runtime packages to install.

## Run on a different port

Set the `PORT` environment variable before starting the server:

```powershell
$env:PORT = 3001
npm start
```

Then open <http://localhost:3001>.

To start on another port on macOS or Linux:

```bash
PORT=3001 npm start
```

## Test

From the repository root, run:

```powershell
npm test
```

The test command checks the factory engine and frontend scheduling, routing, and road logic.

## Using the simulation

- **Factory map** shows the agents, production resources, customer visits, trucks, and active messages.
- **Place customer order** creates a new customer visit and order.
- **Advance 1 hour** moves the simulation forward one simulated hour.
- **Run simulation** starts automatic time progression.
- **Next step (+15 min)** advances the simulation by 15 minutes for detailed inspection.
- **Reset** restores the initial factory state.
- **Order calendar** displays production and delivery reservations.
- **MAS demonstrations** provides scenarios such as shortages, outages, road disruption, urgent orders, and worker absence.
- **Agent messages** shows the communication log and recorded decisions.

Simulation state is stored in memory and shared across browser tabs. Restarting or resetting the server resets the world.

## Project structure

```text
backend/
  engine.js       Factory agents, scheduling, planning, and world state
  engine.test.js  Backend regression tests
  server.js       HTTP server and API
frontend/
  index.html      Browser page
  app.js          Browser state and rendering
  routing.js      Message-route calculations
  roads.js        Road geometry and truck movement
  style.css       Website styles
  assets/         Local illustration assets
package.json      Project scripts and Node.js requirement
```

## Troubleshooting

### Port 3000 is already in use

Start the server on another port as shown in [Run on a different port](#run-on-a-different-port).

### Node.js is not found

Install Node.js 20 or newer, open a new terminal, and confirm `node --version` works.

### The page cannot connect

Make sure `npm start` is still running, then open the exact address printed in the terminal.
