# Order.me

A garment factory scheduling website with deterministic autonomous order agents, workstation agents, a coordinator, and a disruption monitor.

## Run locally

Install Node.js 20 or newer. From this folder run `npm start`, then visit http://localhost:3000. No package installation is required. Run `npm test` to verify scheduling invariants and disruption recovery.

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

`engine.js` owns agents and the simulation state. `server.js` serves the website and JSON actions, with server-sent events for live browser updates. `public/` contains the responsive dashboard, Gantt chart, order form, agent inspector, and filtered message history.

State is shared across local browser tabs and retained in memory until reset or server restart. The server binds to the local computer. This version uses plain browser JavaScript and Node.js built-ins. Persistence, shift calendars, and separate agent processes can be added as further implementations.

## Assignment coverage

The website demonstrates agent goals, capacity constraints, message exchange, negotiation, priority-based conflict resolution, cooperation, environment changes, and replanning. The assignment PPTX has not been supplied, so coverage against individual slides remains unverified.

## Git workflow

Each completed implementation is committed on a feature branch and merged into main with a merge commit. Branches are retained for review. Use `git log --graph --oneline --all` to inspect the history.
