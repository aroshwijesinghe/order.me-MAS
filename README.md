# Order.me

A garment factory network simulation with customer, order, management, HR, inventory, production, calendar, monitoring and delivery agents.

## Run locally

Install Node.js 20 or newer. Open PowerShell in the repository root.

```powershell
cd C:\workspace\order.me-MAS
npm start
```

Open http://localhost:3000. Keep the terminal running and press Ctrl+C to stop. The app uses Node.js built-ins and requires no package installation.

If port 3000 is occupied, choose another port.

```powershell
$env:PORT = 3001
npm start
```

Open http://localhost:3001. Run the engine and resource regression checks with `npm test`.

## Simulation walkthrough

1. Open **Factory map** and click **Run simulation** or **Advance 1 hour**. Click buildings, customers or moving trucks to inspect their agent and current work.
2. Click **Place customer order**. Enter the customer, garment, quantity, priority, delivery location and delivery deadline in simulation hours.
3. The manager requests a plan. Stores checks fabric, HR assigns workers, order agents solicit station offers, and the production manager commits a complete route.
4. Logistics requests truck bids after the planned finishing time. Trucks consider capacity, travel time, multiple trips and return-to-depot commitments. The earliest final arrival is selected.
5. Watch illustrated trucks move between the depot and three fictional customer locations. Working production equipment animates, and paused resources appear desaturated. Order progress changes through cutting, sewing, finishing, dispatch and delivery.
6. Messages appear in a readable queue with a speech bubble attached to the sender. Red arrows point to recipients. **Watch agent communication** replays all recorded messages. Use **Previous message** and **Next message** to inspect an exchange, or **Latest event** to skip queued messages. Every popup shows its recorded simulation hour. Message presentation and production time have separate controls. The **Red agent connections** checkbox controls the background relationship arrows.
7. Open **Order calendar** for daily production bookings, dispatches, arrivals and customer deadlines. The resource schedule includes truck return time. Select a booking to inspect its order.
8. Open **Agent messages** for ACL-style fields, conversations and recorded decisions. Selecting an order makes its conversation filter available.
9. Open **MAS demonstrations** for reproducible outage, worker absence, fabric shortage, fleet shortage, road disruption, urgent order and joining-agent scenarios. Each scenario resets the world.

## Agent responsibilities

| Agent | Decision and visible effect |
| --- | --- |
| Customer | Submits garment requirements and receives delivery commitments |
| Order | Requests stage capacity and selects the earliest complete production route |
| Operations manager | Approves requests and applies priority and delivery requirements |
| Production manager / coordinator | Commits routes without conflicting station reservations |
| HR | Allocates staff across stations, reducing effective rates during absence |
| Stores / warehouse | Reserves fabric, issues it at cutting and holds finished goods for dispatch |
| Cutting, sewing and finishing | Offer available time slots using capacity, staffing and existing bookings |
| Calendar | Publishes production commitments, delivery arrivals and deadline outcomes |
| Logistics | Invites truck bids and chooses the earliest final customer arrival |
| Truck | Offers feasible delivery slots, observes load capacity and reserves return journeys |
| Monitor | Reports production and road disruptions to trigger replanning |

The agent inspector exposes goals, beliefs, intentions, sensors, actions and recent decisions. Stores has a fabric receipt control. HR has an attendance control. Production stations and trucks have pause/restore controls.

## Resource and time model

- One garment consumes one metre of fabric. Fabric is reserved only for feasible production routes and consumed once when cutting begins. Stock can be replenished from the Stores inspector.
- The initial workforce has ten people. HR protects staff on active operations, spreads minimum crews across available stations, then fills target crews. Production rate scales with assigned workers. Attendance changes cannot remove workers from active work.
- The initial fleet has two trucks with capacities of 150 and 200 garments. Larger orders use repeated round trips. The order is delivered when its last load arrives. Truck calendars reserve the full duration through the final return.
- Customers occupy three fixed locations on a fictional campus map. Normal one-way journeys take two or three simulated hours. Road disruption doubles future journey times.
- Deadlines refer to final delivery. Production schedules and truck schedules expose late plans. Finished goods wait if every truck is unavailable.
- Replanning preserves operations and journeys whose start is earlier than the current simulation hour. Pausing a busy resource withdraws future capacity while its active work completes.
- The clock starts at 08:00 on 25 November 2026 and advances continuously with no shift calendar. The displayed dates are fictional simulation dates. Each automatic tick advances one hour.
- Reset and server restart restore seeded data. State is shared across browser tabs and held in memory.

## MAS demonstrations and scope

Messages expose a sender, receiver, performative, conversation ID, ontology and protocol. The capacity negotiation uses CFP, PROPOSE, REFUSE, ACCEPT, WAIT and completion messages. Production and delivery both use bids. Scenario evidence cards report actual recorded messages and current reservations.

The shared capacity notice board shows current resource advertisements. BDI and PEAS fields describe the deterministic decision rules. The simulation runs in one Node.js process with serial actions and a shared world. Its Contract-Net and ACL models are simplified. Learning, coordinator failover, multi-round constraint relaxation and a measured together-versus-alone emergence benchmark remain future work.

The friend's blood-network plan informed the MAS demonstrations. Coverage against every slide of the assignment PPTX remains unverified.

## Project structure

- `backend/engine.js` contains agents, planning, inventory, staffing, truck schedules and simulation state.
- `backend/server.js` serves the frontend, JSON actions and server-sent events.
- `backend/engine.test.js` checks scheduling, inventory, workforce and delivery invariants.
- `frontend/` contains the map, calendar, dashboard, agent inspector and message replay.
- `package.json` and this README live at the root.

## Git workflow

Implement changes on the persistent `dev` branch. After each completed implementation, run relevant checks, commit with a human-readable message and push `dev`. After a major verified implementation, merge `dev` into `main` with a merge commit and push `main`. Continue subsequent work on `dev`.


## Generated artwork

The built-in ImageGen tool generated the local transparent illustration atlas at `frontend/assets/network-atlas.png`. The twelve sprites cover delivery trucks, operations management, HR, stores, production management, calendar, depot, monitor, cutting, sewing, quality inspection and customers. CSS selects cells from the shared image. Production motion and truck travel use CSS animations with reduced-motion support.

The final image-generation prompt was

> Create ONE production-ready UI sprite atlas image for a garment factory multi-agent simulation. Landscape canvas with EXACTLY 4 columns and 3 rows of equal rectangular cells. Each cell contains ONE separate centered small isometric 3D clay illustration, consistent perspective, soft studio lighting, forest green/teal with warm yellow accents, readable at 70px size. Generous transparent padding in every cell, no overlap, no text, no letters, no numbers, no border, no background scenery, actual transparent background. Cell order row 1 left to right: (1) delivery box truck facing right, large wheels, white cargo box and green cab, (2) operations manager person at office desk, (3) human resources team of three people, (4) warehouse full of fabric rolls and cardboard boxes. Row 2 left to right: (5) production manager person holding a clipboard standing beside a small factory, (6) upright calendar planner with small colored squares and a clock, (7) shipping depot building with loading dock and parcels, (8) monitoring computer with radar display and amber warning light. Row 3 left to right: (9) fabric cutting table with cloth and scissors, (10) industrial sewing machine with fabric, (11) quality inspection table with folded shirt and magnifying glass, (12) customer retail building with clothing shop window and a person. Keep all 12 subjects fully inside their cells and of similar visual scale. A polished coherent game asset sprite atlas, crisp silhouettes, no captions.
