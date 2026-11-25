# Order.me

A garment factory scheduling website with deterministic autonomous order agents, workstation agents, a coordinator, and a disruption monitor.

## Run locally

Install Node.js 20 or newer, then open PowerShell in the project folder.

```powershell
cd C:\workspace\order.me-MAS
npm start
```

Open http://localhost:3000 in your browser. Keep the terminal running. Press Ctrl+C in that terminal to stop the server. No package installation is required.

If port 3000 is occupied, use another port.

```powershell
$env:PORT = 3001
npm start
```

Then open http://localhost:3001. Run `npm test` to verify scheduling invariants and disruption recovery.

## Demonstration

1. Inspect the initial school shirts, sports jerseys, and trousers schedules.
2. Select a booking to see that order's CFP, PROPOSE, ACCEPT, and CONFIRM messages.
3. Select an agent to inspect its goal, constraints, and latest event.
4. Pause sewing line A before advancing time. Show the revised allocation to line B.
5. Enable “Show previous schedule” to compare reservations.
6. Pause both sewing lines to demonstrate waiting for capacity. Restore a line to recover.
7. Add an urgent order, then advance the simulated clock or run automatically.
8. Reset to replay the original scenario.

## Scheduling model

Each order follows cutting, sewing, and finishing. Station agents calculate available slots using quantity and production rate. Order agents compare complete candidate routes and choose the earliest finish. The coordinator commits each route atomically, processing requests by descending priority, earliest deadline, and submission order. The single Node.js event loop serializes actions to prevent concurrent reservation conflicts.

The monitor announces station disruptions. Completed and active operations remain booked. Future operations are renegotiated. Pausing a station represents withdrawing future capacity while active work finishes. The clock uses continuous production hours with no shift calendar. An impossible due date is reported as late. Unavailable production routes wait for capacity.

## Architecture

`backend/engine.js` owns agents and the simulation state. `backend/server.js` serves the website and JSON actions, with server-sent events for live browser updates. `frontend/` contains the responsive dashboard, Gantt chart, order form, agent inspector, and filtered message history.

State is shared across local browser tabs and retained in memory until reset or server restart. The server binds to the local computer. This version uses plain browser JavaScript and Node.js built-ins. Persistence, shift calendars, and separate agent processes can be added as further implementations.

## Assignment coverage

The website demonstrates agent goals, capacity constraints, message exchange, negotiation, priority-based conflict resolution, cooperation, environment changes, and replanning. The assignment PPTX has not been supplied, so coverage against individual slides remains unverified.

## Git workflow

Implement changes on the persistent `dev` branch. After each implementation, run the relevant checks, commit with a clear human-readable message, and push `dev`. After a major implementation is verified, merge `dev` into `main` with a merge commit and push `main`. Continue subsequent work on `dev`.

## Project structure

- `backend/` contains the HTTP server, scheduling engine, and engine tests.
- `frontend/` contains the dashboard HTML, CSS, and browser JavaScript.
- `package.json` and this README stay at the root for startup and testing.

Run `npm start` from the repository root. The backend serves the frontend and API together.

## Presenting how the MAS works

This project uses the garment factory scenario. The agents execute deterministic scheduling rules in one Node.js process.

1. Reset the simulation. Click **Replay negotiation** to follow the recorded messages. Use **Previous message** and **Next message** to explain individual decisions. Replay controls the message presentation. **Advance 1 hour** and **Run simulation** control production time.
2. Observe order agents send CFP requests. Station agents return PROPOSE messages containing available time slots.
3. Inspect ACCEPT and CONFIRM messages. Orders choose the route with the earliest completion. The coordinator processes competing orders by priority, deadline, and submission order.
4. Select an order or booking to filter its conversation. Select an agent to see its goal, constraints, and latest event.
5. Before advancing time, pause sewing line A. The monitor sends ALERT, unavailable stations send REFUSE, and future work is negotiated again. Enable **Show previous schedule** to compare allocations.
6. Pause both sewing lines to observe WAIT. Restore a line to let agents obtain a complete route.
7. Add an urgent order using **New order**, then inspect the revised reservations and deadline outcome.
8. Advance production to see INFORM messages for completed stages.

The UI exposes autonomous order decisions, station capacity constraints, agent communication, negotiation, resource competition, coordination, monitoring, and disruption recovery. The assignment PPTX is unavailable in this workspace, so coverage of its individual requirements remains unverified.
