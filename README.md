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

1. Open **Factory map**. The top-left corner shows elapsed simulation hours, **Auto run/Pause**, **Step mode**, **Next hour** and **Reset**. **Step mode** stops automatic time and message playback. Use **Next hour** to advance production manually and **Previous message / Next message** to inspect communication. **Auto run** resumes automatic progression. **Advance 1 hour** in the main toolbar also stops automatic running and performs one manual simulation step, letting you inspect production, visits and deliveries hour by hour. The full-width map uses larger labels. Click a customer building or visiting customer to open an order form prefilled with its name and delivery location. Click other buildings or trucks for their profiles and controls.
2. Click **Place customer order**. Enter the customer, garment, quantity, priority, delivery location and delivery deadline in simulation hours, then send the customer to reception. Advance time to watch arrival, order placement and departure. The request enters production planning at arrival.
3. The manager requests a plan. Stores checks fabric, HR assigns workers, order agents solicit station offers, and the production manager commits a complete route.
4. Logistics requests truck bids after the planned finishing time. Trucks consider capacity, travel time, multiple trips and return-to-depot commitments. The earliest final arrival is selected.
5. Watch illustrated trucks move between the depot and three fictional customer locations. Working production equipment animates, and paused resources appear desaturated. Order progress changes through cutting, sewing, finishing, dispatch and delivery.
6. Messages appear in a readable queue with a speech bubble attached to the sender. Active messages use colored solid arrows that bend through clear space around agents, vehicles, visitors and the popup. **Watch agent communication** replays all recorded messages. Use **Previous message** and **Next message** to inspect an exchange, or **Latest event** to skip queued messages. Every popup shows its recorded simulation hour. Message presentation and production time have separate controls. Arrows appear during active communication and disappear when the live queue finishes. Request, offer, accepted, update and alert colors match the popup and agent highlights.
7. Open **Order calendar** for daily production bookings, dispatches, arrivals and customer deadlines. The resource schedule includes truck return time. Select a booking to inspect its order.
8. Open **Agent messages** for ACL-style fields, conversations and recorded decisions. Selecting an order makes its conversation filter available.
9. Open **MAS demonstrations** for reproducible outage, worker absence, fabric shortage, fleet shortage, road disruption, urgent order and joining-agent scenarios. Each scenario resets the world.

## Agent responsibilities

| Agent | Decision and visible effect |
| --- | --- |
| Customer | Sends requirements to the operations manager and receives manager-relayed commitments |
| Order | Requests stage capacity and selects the earliest complete production route |
| Operations manager | Acts as the customer contact, forwards approved requests internally and relays updates to the relevant customer |
| Production manager / coordinator | Commits routes without conflicting station reservations |
| HR | Allocates staff across stations, reducing effective rates during absence |
| Stores / warehouse | Reserves fabric, issues it at cutting and holds finished goods for dispatch |
| Cutting, sewing and finishing | Offer available time slots using capacity, staffing and existing bookings |
| Calendar | Publishes production commitments, delivery arrivals and deadline outcomes |
| Logistics | Invites truck bids and chooses the earliest final customer arrival |
| Truck | Offers feasible delivery slots, observes load capacity and reserves return journeys |
| Monitor | Reports production and road disruptions to trigger replanning |

Click any map agent or visiting customer to open its complete profile. The side panel has been removed. Agent controls and the agent selector are available inside the popup profile. Customer profiles are accessible from **Customer agent details** in the order form. Profiles expose situatedness, autonomy, adaptivity, sociability, rationality, omniscience, goals, beliefs, intentions, PEAS, available actions, task knowledge, evaluation criteria, task environment classifications and the chronological percept sequence. The Stores popup has a fabric receipt control. The HR popup has an attendance control. Production stations and trucks have pause/restore controls.

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


## Customer visits and agent profiles

New customer visits take two simulation hours to reach reception, one hour to submit and acknowledge the order, and two hours to leave. Simultaneous visitors receive successive submission slots. Orders are validated before a visit is queued and the delivery deadline must be after arrival. Submission happens exactly once. Existing seeded orders begin with their customers already at reception.

Use **Customer reception visit** in MAS demonstrations for a reproducible example. Customer sprites follow the simulation clock, with display interpolation between steps. Customers disappear after returning to the entrance while their accepted orders continue.

The engine records received messages and decision-time observations as percepts. The profile lists the complete recorded input history for the selected role. The controller exposes exact current modeled resource state. The modeled processing environment is fully observable, deterministic, sequential, dynamic across simulation ticks, discrete, known and multi-agent. Random customer mode adds sampled external arrivals, and the profile updates its outcome classification accordingly. The profile explains the basis and distinguishes alternative classifications. Future user interventions remain unknown. Policies use reactive adaptation and fixed decision rules.

Agent architecture labels are implementation-specific interpretations using the terminology in [Artificial Intelligence ? A Modern Approach, Chapter 2](https://aima.cs.berkeley.edu/4th-ed/pdfs/newchap02.pdf). The profile identifies Monitor as simple reflex, Stores/Calendar/Customer as model-based reflex, production and workforce roles as goal-based, and Order/Logistics as utility-based. Scores and evaluation criteria are explained per role.

The built-in ImageGen tool generated the additional visitor sprite at `frontend/assets/customer-visitor.png` with the following final prompt.

> A single full-body customer visitor walking to a garment factory reception, isolated on actual transparent background. Friendly isometric 3D clay game asset matching a forest green and warm yellow factory simulation. One adult woman wearing forest green jacket, cream trousers and yellow shoulder bag, holding a small order clipboard. Three-quarter view facing right, casual walking pose, soft studio light, polished readable silhouette, entire person inside image with generous transparent margins. No text, no extra people, no floor, no scenery. Intended as a small animated character sprite.


## Communication routing

The map displays one active message connection at a time. Requests are blue, proposals purple, accepted work teal or green, informational updates cyan and exceptions amber. The popup, sender/receiver highlights and arrow share the message color. A gentle pulse respects reduced-motion settings.

The router in `frontend/routing.js` uses measured entity bounds and padded horizontal/vertical corridors. It chooses free departure and arrival ports, bends around obstacles, and keeps the arrowhead outside the recipient. When a fully blocked layout has no clear path, the popup still presents the message. Inspecting a recorded message keeps its connection visible until playback resumes.


## Truck movement

Road drawing and vehicle movement share the road geometry in `frontend/roads.js`. Both trucks park in adjacent bays in the dispatch parking area. Each bay has its own spur into a shared access lane. Outbound and return trips use that lane, the main road and the customer access road. Animation includes every junction crossed between clock updates. Rapid manual steps resume from the displayed position, and repeated loads return along the same route. Resizing and reduced-motion mode use road-aligned snapshot positions.


## Customer communication boundary

The operations manager is the assigned contact for every current customer order. Customer-facing messages pass through that manager in both directions. The message router records an internal-to-manager hop followed by a manager-to-customer hop, or a customer-to-manager hop followed by the approved internal request. Relays retain the order/conversation identifier and record the originating message.

Internal order agents run in the company's production-planning workspace and are displayed at the production manager. The live map, message replay, communication log and percept histories use the routed sender and receiver. Calendar commitments and truck delivery reports reach customers through the manager.


## Random customer traffic

Enable **Random customer arrivals** above the live map, then use **Auto run** or **Next hour**. The **Random customer day** scenario also enables it after resetting the factory.

A new visitor is generated every 2?6 simulation hours. Quantities range from 20?80 garments. Customer locations and Normal, High and Urgent priorities are sampled in shuffled groups of three so each group includes every customer location and priority. Delivery lead times vary with urgency. Every visitor walks to reception, submits through the operations manager and leaves. New orders trigger priority-based replanning while active operations complete.

The live map shows the next arrival, generated visitor count and priority-sorted planning queue. Disable the checkbox to stop generating visitors. Existing visitors and orders finish through the normal resource constraints. Fabric shortages can be resolved in the Stores profile.

Traffic uses a seeded pseudo-random generator for reproducible checks, with a fresh seed on each enable. The API accepts an optional integer seed on the `random-traffic` action. Reset disables traffic. Generation stops near the 1000-hour planning horizon.
