# Sol Defense Force — Phase 1

A local, interactive first look at the strategic navigation map for SDF, set in 2250.

## Run

Requires Node.js. No dependency installation is needed.

```sh
npm start
```

Open http://127.0.0.1:2250. Run navigation checks with `npm test`.

## Artwork workspace

Keep artwork drafts, generation prompts, Blender scenes, and intermediate renders in `C:\Users\tabey\development\Image Creation\output`. The former `SDF\output` and `SDF\outputs` folders were merged into that existing folder on October 29, 2026, preserving their contents and subfolders. For an old chat link or command, replace either original folder prefix with this new location; historical audit records may still contain the original paths.

Final five-view PNGs used by the game remain in this project's `images/` folder. Create future artwork working files in the external artwork workspace. The migration manifest in `C:\Users\tabey\development\Image Creation` records the original and destination file paths and SHA-256 hashes.

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

Open **Bridge** in the top navigation. Select a console on the deck plan or use the station directory. Smaller displays provide a station selector; phones switch between the deck plan and one station console so neither view needs page scrolling. Navigation and Helm provide **Sector chart / Flight controls** tabs on phones, with the controls scrolling inside their panel.

| Station | SDF duties |
| --- | --- |
| Command area | Captain and first-officer seats, watch condition, access to every station |
| Conn / Helm | Vector Drive thrust and attitude, automatic maneuver execution, EPD flight controls |
| Operations | Daily resources, internal systems, duty priorities, sensor coordination |
| Navigation | Local sector chart, patrol waypoints, predicted paths, hazard braking, Solar System planner |
| Tactical | Target locks, combat maneuver orders, relative motion and closure telemetry |
| Security / Defense | Internal security, protective systems, watch condition, threat reports |
| Science | Sensor assignments, selected-target catalog review, future anomaly research |
| Communications | Sol Command link, hailing responsibilities, shipboard patrol reports |
| Engineering | Cold fusion core, EPD, power distribution, dampeners, damage-control readiness |
| Environment / Life Support | Atmosphere, habitat temperature, artificial gravity, air and waste processing |

Helm uses the same EPD navigation state and safety checks as the strategic map. A ship without a valid safe course cannot engage from Helm. Navigation opens a local sector chart; **Solar System / EPD** returns to the strategic planner. The bridge settings persist locally in the browser: command seat, routine/heightened watch, duty priority, sensor assignment, habitat temperature, and selected station.

### Local flight: Tactical → Navigation → Helm

These stations share one three-dimensional sector simulation. Tactical chooses the combat objective, Navigation calculates velocity guidance and checks the stopping corridor against a training debris field, and Helm applies bounded Vector Drive acceleration. Select a target, choose **Intercept** (5 km standoff), **Match velocity**, **Maintain range**, **Open distance**, or **Break away**, then execute. Range orders accept 5–200 km and apply to the active target even when multiple contacts are locked. The footer shows the shared maneuver, actual range, requested range where applicable, relative closure, and ship speed. Unlocking a target does not cancel an already executing flight order; **Cancel maneuver / coast** does.

Navigation offers 100, 250, 500, 1,000, and 2,500 km map radii (up to 5,000 km across), top X/Y and rear X/Z projections, current 200 km radar coverage, 60-second trajectory predictions, hazards, and eight patrol waypoints. Click the chart or enter explicit X/Y/Z sector coordinates to append a waypoint, then **Fly patrol route**. The chart follows the ship with fixed sector axes; Tactical rotates its local frame with the bow. Bow tracking points at the maneuver target independently of the flight velocity. Current sensor tracks use the same classification shapes as Tactical. Contacts that leave radar coverage retain a hollow last-known position with its age; unknown identity stays unknown. Losing a maneuver target beyond 200 km cancels guidance and coasts. Verified IFF identity is retained after a contact passes beyond the 60 km identification radius.

Helm provides signed thrust, thrust bearing and elevation, and independent bow bearing. **Apply manual Helm** cancels the automatic maneuver. Zero thrust preserves momentum; **Brake to sector rest** actively removes velocity in the fixed sector frame. Automatic Navigation brakes when the predicted stopping/command corridor intersects the 3D debris exclusion zone; it asks for a waypoint around the hazard rather than calculating a detour. Manual Helm bypasses that automatic protection. The provisional maximum speed is 7,200 KPH and acceleration is 120 KPH per simulated second. Collision damage and weapons are not implemented.

Local simulation starts paused and runs when a maneuver, patrol, or manual order is issued. Navigation and Helm offer pause/run and 1×, 10×, and 60× local time; local time also advances the shipboard clock. Hidden browser tabs suspend local advancement. EPD engagement suspends local flight and prevents local orders during transit. Final EPD arrival or abort initializes a fresh training sector at that destination; restarting patrol also resets local flight and locks. Local positions, orders, and sensor memory are session-only and reset on page reload; strategic navigation and bridge preferences retain their existing persistence. This is a moving training encounter anchored to the destination, with constant-velocity contact traffic, not an orbital or adversarial combat simulation.

Tactical opens a weapons interface with synchronized **top (X/Y)** and **rear (X/Z)** radar screens. The rear view looks forward from aft: +X is starboard, +Y is forward, and +Z is above the ship. Select **10, 20, 60, 100, 140, or 200 km** to set both screens. Each has three intermediate rings at 25%, 50%, and 75% of range plus the outer range circle. The ship remains centered. Unknown contacts use yellow diamonds, neutral contacts grey triangles, friendly contacts green circles, and enemies red squares. Each track has an arrowed direction line projected from its velocity into each view; the line indicates direction, not speed or distance traveled. Hover or keyboard-focus a contact to see distance in KM, speed in KPH, and signed elevation: positive Z / above is green, negative Z / below is red, and zero is neutral. Signed Y separately identifies in front / behind using the same colors.

The hover readout also shows **Vc**, the closure rate in KPH: **positive / Closing** means approaching our ship; **negative / Opening** means moving away. It uses the complete 3D line-of-sight projection `Vc = -(position · relative velocity) / distance`, independently of radar view and display range. Hover speed is relative speed; the shared flight footer shows our ship's sector speed. Vc rounds to whole KPH; a value that rounds to zero reads **Steady range**, and coincident positions read **Vc — / Co-located** because a line of sight cannot be defined. Vc remains available for unidentified contacts without revealing their identity.

**Left-click** a contact on either radar to select and lock only that target, replacing the previous selection, and show its ship details in the right panel. **Ctrl + left-click** adds an unselected contact or deselects/unlocks an already selected contact while preserving the other locks. **Ctrl + Enter / Space** provides the same toggle from a focused track. Track buttons in the right panel follow the same single-selection and Ctrl-toggle behavior. **Release all target locks** explicitly clears the selection. Contacts beyond the selected three-dimensional range disappear from both plots; locks are retained with an out-of-range notice. The **Lock target** selector selects one in-range track. Phones switch between **Radar screens** and **Target details**; a normal contact tap selects that ship alone and opens its details. The range setting persists locally.

**IFF** verifies a contact's identity and ship type with an approximately **90% success chance within 60 km**, measured in three dimensions from our ship. Each track gets one stable assessment; changing display range, locking, or refreshing the page does not reroll it. The training encounter includes one unsuccessful nearby IFF return. Unidentified contacts are yellow diamonds with generic TRK identifiers, unknown ship type and size, and no disclosed name, registry, affiliation, role, armaments, or engines. Their measured distance, speed, direction, and position remain available. Confirmed contacts show their verified classification and provisional size class. Contacts first observed beyond the 60 km identification radius have no confirmed IFF identity until they enter that radius and pass the stable assessment.

Click the ship type beneath an identified ship's name in the right panel to open its **five-view reference**. All twelve types use their matching existing `images/*-five-view.png` composites, shown in full with top, side, bottom, front, and rear views. Close with the × button, Escape, or a backdrop click; **Full-size image** opens the original PNG. Unknown types have no reference button or image, preserving IFF uncertainty. Viewing a reference leaves target locks unchanged.

### Armament catalog and confirmed SDF fits

Open **Armament catalog** from Tactical or the ship armaments section. The shared catalog contains seven types: Anti-ship (AS) missiles, Multi-purpose (MP) missiles, General Purpose (GP) missiles, 120 mm Autocannon, 75 mm Autocannon, 30 mm CIWS, and Rail Gun. The cruiser has one turret-mounted Rail Gun; the heavy cruiser has two Rail Guns in one turret. Weapon performance remains unspecified. Ship loadouts reference stable catalog IDs so more types can be added later. Use **Ship class specification** in the catalog to browse the confirmed frigate, destroyer, cruiser, and heavy cruiser fits. These public class references do not identify an unknown radar contact. The default is our ship's SDF frigate specification, also shown for identified SDF frigate contacts:

| Armament | Quantity | Mounting |
| --- | --- | --- |
| 120 mm Autocannon | 2 guns | 2 turrets, 1 autocannon each |
| Multi-purpose (MP) missiles | 20 missiles | Dorsal / top |
| Anti-ship (AS) missiles | 30 missiles | Ventral / bottom |
| 30 mm CIWS | 2 systems | 1 port, 1 starboard |

The confirmed **SDF destroyer** fitting appears for identified destroyer contacts:

| Armament | Quantity | Mounting |
| --- | --- | --- |
| 120 mm Autocannon | 4 guns | 2 turrets, 2 autocannons each |
| Multi-purpose (MP) missiles | 24 missiles | Dorsal / top |
| Anti-ship (AS) missiles | 40 missiles | Ventral / bottom |
| 30 mm CIWS | 2 systems | 1 port, 1 starboard |

The confirmed **SDF cruiser** fitting is:

| Armament | Quantity | Mounting |
| --- | --- | --- |
| 120 mm Autocannon | 4 guns | 2 turrets, 2 autocannons each |
| Rail Gun | 1 gun | 1 turret |
| Multi-purpose (MP) missiles | 28 missiles | Dorsal / top |
| Anti-ship (AS) missiles | 50 missiles | Ventral / bottom |
| 30 mm CIWS | 4 systems | 2 port, 2 starboard |

The confirmed **SDF heavy cruiser** fitting is:

| Armament | Quantity | Mounting |
| --- | --- | --- |
| 120 mm Autocannon | 4 guns | 2 turrets, 2 autocannons each |
| Rail Gun | 2 guns | 1 turret, 2 rail guns |
| Multi-purpose (MP) missiles | 40 missiles | Dorsal / top |
| Anti-ship (AS) missiles | 78 missiles | Ventral / bottom |
| 30 mm CIWS | 4 systems | 2 port, 2 starboard |

All four SDF classes have **chaff dispensers** and **flare dispensers**. Their confirmed shuttle and engine counts are:

| Class | Shuttle bays | Shuttles | Engines |
| --- | --- | --- | --- |
| SDF frigate | 1 | 2 | 2 |
| SDF destroyer | 1 | 2 | 2 |
| SDF cruiser | 1 | 2 | 2 |
| SDF heavy cruiser | 1 | 4 | 3 |

Countermeasures, shuttle facilities, and engines appear in separate sections in the class catalog and identified ship details. Engine models and EPD ratings remain provisional. Dispenser quantities are not yet specified. Other ship-class fittings remain provisional and have no assigned weapon quantities. Unidentified contacts retain unknown armaments, countermeasures, shuttle facilities, and engines. This adds equipment data and displays; ammunition expenditure, firing, countermeasure deployment, shuttle launch/recovery, weapon ranges, and damage are not simulated yet.

The training encounter begins with twelve contacts, one for each underlying ship type: UNE cargo ship, light cargo ship, transport, and large transport; privateer; private yacht; pirate frigate and corvette; SDF frigate, destroyer, cruiser, and heavy cruiser. Set 200 km initially to see every contact; IFF determines which identities are revealed. Ship names, registries, size classes, and engine models are provisional fictional data. Armaments use the shared catalog; all four SDF class fittings and engine counts are user-confirmed, while other class fittings remain provisional. Weapons remain safed; firing, damage, hostile AI, internal force fields, and detailed power/resource simulation are future systems. Science reviews the existing navigation catalog rather than generating new discoveries. Communications reports are written to the shipboard log; no external messages are sent. Nominal engineering/support readouts describe the prototype's starting condition. Temperature is an editable setpoint; atmosphere at 101 kPa and artificial gravity at 1.0 g are provisional defaults, without a simulated crew-health model.

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

The Sun stays at the origin. The overview uses a logarithmically compressed radial scale to keep all planets readable; its square grid is a display reference, not uniform AU cells. Navigation coordinates, travel distances, and ETAs use a separate AU coordinate space. Curved-looking map routes are straight legs in this physical coordinate space. Planet positions are illustrative, not an astronomical ephemeris for 2250, and remain fixed in this prototype. Strategic EPD acceleration, orbital interception, moving astronomical bodies, weapons combat, supplies, and crew simulation are reserved for future phases. Local sector maneuvers use the separate kilometer-scale Vector Drive model described above; their displacement is not drawn on the compressed heliocentric chart.

The application runs without third-party JavaScript dependencies or external assets. Optional Google Fonts enhance the typography when available; local system fonts provide fallbacks. No data is sent to a server or external game service.
