# Sol Defense Force — Phase 1

A local, interactive first look at the strategic navigation map for SDF, set in 2250.

## Run

Requires Node.js. No dependency installation is needed.

```sh
npm start
```

Open http://127.0.0.1:2250. Run navigation checks with `npm test`.

## Command your ship

- Select a planet from the map or directory, or click empty space to choose a custom waypoint.
- Add up to 12 waypoints, then engage EPD. Unsafe courses through Sol's 0.18 AU exclusion zone are blocked; add a waypoint around Sol.
- Pause or resume transit, and change the simulation rate with 1×, 10×, or 100×. At 1×, one real second advances 0.08 simulation days during transit. Time holds while idle or paused; background tabs do not fast-forward the journey.
- Abort to hold position and retain the remaining flight plan. Individual waypoints can be removed while holding.
- Drag to pan, scroll or use +/− to zoom, and use the center control to restore the overview.
- The console fits the available viewport without page scrolling. Narrow or short displays use Map, Ship & system, and Navigation view buttons; selecting a destination opens Navigation, and engaging EPD returns to the map. Flight plans show up to two waypoints per page (one on short phones) with previous/next buttons, so all 12 stops remain accessible without scrolling.
- Ship position, game time, and route are saved in local browser storage. Active journeys resume paused after reload. Saves are local to this browser and site origin.
- To start over, open Mission briefing and choose Restart patrol at Earth.

## Bridge stations

Open **Bridge** in the top navigation. Select a console on the deck plan or use the station directory. Smaller displays provide a station selector; phones switch between the deck plan and one station console so neither view needs page scrolling.

| Station | SDF duties |
| --- | --- |
| Command area | Captain and first-officer seats, watch condition, access to every station |
| Conn / Helm | Execute a plotted EPD course, pause/resume transit, abort and hold position |
| Operations | Daily resources, internal systems, duty priorities, sensor coordination |
| Navigation | Solar charts, patrol destinations, safe course plotting |
| Tactical | Weapons posture, defensive readiness, target assessment |
| Security / Defense | Internal security, protective systems, watch condition, threat reports |
| Science | Sensor assignments, selected-target catalog review, future anomaly research |
| Communications | Sol Command link, hailing responsibilities, shipboard patrol reports |
| Engineering | Cold fusion core, EPD, power distribution, dampeners, damage-control readiness |
| Environment / Life Support | Atmosphere, habitat temperature, artificial gravity, air and waste processing |

Helm uses the same navigation state and safety checks as the strategic map. A ship without a valid safe course cannot engage from Helm. Navigation returns to the existing planner. The bridge settings persist locally in the browser: command seat, routine/heightened watch, duty priority, sensor assignment, habitat temperature, and selected station.

This is the Phase 1 bridge foundation. Tactical posture begins safed; weapons fit, combat, internal force fields, moving sensor contacts, detailed power/resource simulation, and damage are future systems. Science reviews the existing navigation catalog rather than generating new discoveries. Communications reports are written to the shipboard log; no external messages are sent. Nominal engineering/support readouts describe the prototype's starting condition. Temperature is an editable setpoint; atmosphere at 101 kPa and artificial gravity at 1.0 g are provisional defaults, without a simulated crew-health model.

The bridge roles follow the user's supplied Star Trek reference, adapted to SDF's 2250 cold fusion and EPD setting. Warp drive, impulse engines, phasers, photon torpedoes, and subspace communications are not established SDF technology by this prototype.

## Setting and assumptions

### Settlements

| Planetary system | Established location |
| --- | --- |
| Earth | Large station on the Moon |
| Mars | Surface colony and a station on Phobos |
| Jupiter | Station on Ganymede |
| Saturn | Station on Titan |
| Uranus | Station on Titania |
| Neptune | Station on Triton |

Use **Settlements** in the system directory, or select a site marker on the map, to add any of these seven locations to a patrol. Stations use a cross-shaped diamond symbol; the colony uses a building symbol. Site markers sit close to their parent planets on the same displayed heliocentric orbital circle; the two Mars sites flank Mars. Station and colony map labels appear on hover or keyboard focus, including the heliopause station. Selecting an object highlights its marker with a ring, without a rectangular outline around its name and details. The schematic positions do not show moon orbits to scale; routes and the ship marker use physical navigation coordinates near the parent planet. Local distances display in kilometers. Nominal EPD estimates remain a strategic abstraction: launch, landing, docking, and detailed local transfer speeds are not yet simulated.

Titania was selected because it is larger than Oberon ([NASA](https://science.nasa.gov/uranus/moons/titania/)). Neither is assumed to be safer overall; advanced shielding is part of the game's setting. Moon-to-parent separations use rounded [JPL mean orbital radii](https://ssd.jpl.nasa.gov/sats/elem/), with fixed illustrative directions. The colony's surface offset is illustrative. These locations are not an ephemeris for 2250.

### Asteroid-belt mining

Sixteen commercial mining stations operate between 2.2 and 3.3 AU, each selectable as a patrol waypoint. Hexagonal pickaxe symbols distinguish mining stations from the standard crossed-diamond station symbol used at moon stations and Heliopause. Their map labels appear on hover or keyboard focus. The **Mining** directory shows four stations per page and can filter by company. Selecting a mining station exposes a **Contract** button with its owner, government issuer, contract number, and active status.

| Mining company | Owned stations |
| --- | --- |
| Asterion Resource Group | Alpha, Beta, Gamma, Delta |
| Helios Deepcore Industries | Epsilon, Zeta, Eta, Theta |
| Peregrine Beltworks | Iota, Kappa, Lambda, Mu |
| Vulcan Frontier Mining | Nu, Xi, Omicron, Omega |

The United Nations of Earth government awards the mining contracts. Each of these sixteen stations has a distinct active UNE contract. Company names, station names, placements, and contract numbers are part of the fictional 2250 setting. Greek-letter names are written in the Latin alphabet, with Omega included among the sixteen selected names.

Future setting note: freelance miners who supply pirates exist in the setting and will be developed in a later phase. Freelance mining, pirate supply chains, and contract-awarding gameplay are not simulated in Phase 1.

### World and navigation

The user is captain of an SDF vessel patrolling the Solar System in 2250. Cold fusion was achieved around 2150. Electromagnetic Pulse Drives, inertial dampeners, and advanced protective materials enable travel across the system in just over a month.

Provisional details for review: SDF Wayfarer, Vanguard-class frigate, a heliopause station at a 120 AU patrol boundary, and a nominal cruise rate of 3.8 AU/day (approximately 31.6 days for a radial 120 AU crossing). This boundary represents the prototype patrol area, not a claim that the Solar System ends there.

The Sun stays at the origin. The overview uses a logarithmically compressed radial scale to keep all planets readable; its square grid is a display reference, not uniform AU cells. Navigation coordinates, travel distances, and ETAs use a separate AU coordinate space. Curved-looking map routes are straight legs in this physical coordinate space. Planet positions are illustrative, not an astronomical ephemeris for 2250, and remain fixed in this prototype. Acceleration, orbital interception, moving bodies, encounters, combat, supplies, and crew simulation are reserved for future phases.

The application runs without third-party JavaScript dependencies or external assets. Optional Google Fonts enhance the typography when available; local system fonts provide fallbacks. No data is sent to a server or external game service.
