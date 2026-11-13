# Sol Defense Force — Beta

A Solar System patrol and ship command game set in 2100. The Windows beta runs offline as a standalone Electron app.

## Windows beta

Run the portable EXE from `release/`, or install the game with the setup EXE. Both Windows x64 builds include Electron, the Game Manual, and the game fonts. See [QA notes](desktop/QA-START-HERE.txt) for the first patrol and the details to include in a bug report. The builds are unsigned.

Use `npm ci` to install the pinned development tools. Run `npm run start:desktop` for the desktop app, `npm run dist:win` to build both EXEs, or `npm run pack:win` to build the unpacked application. `npm run test:desktop` checks the desktop game with an isolated save profile. Set `SDF_EXECUTABLE` to the absolute path of `release/win-unpacked/Sol Defense Force.exe` to run the check against a packaged build.

The desktop autosave lives under `%APPDATA%\Sol Defense Force` and is shared by the portable and installed builds. To move an existing browser patrol, export it from **Saves** and import the JSON with **Load Saved Game** in the desktop app.

## Run

Interface text uses an 11 px minimum (`--font-small` in `styles.css`), including labels, hints, status text, button numbers, and narrow-screen layouts. Keep future small-text styles at this minimum or larger; wrap or scroll content instead of shrinking text to fit.

The browser version requires Node.js. Its local server can run without installing the desktop build tools.

```sh
npm start
```

Open http://127.0.0.1:2250. Run navigation checks with `npm test`.

The start screen offers **New Mission**, **Load Saved Game**, **History** (setting and backstory), and **How to Play**. **Continue** appears when an autosaved patrol is available. New Mission opens a briefing before replacing the autosave, with an option to export the current patrol first. **New Campaign** explains that campaign progression is not yet implemented and links to the playable mission. Use **Menu** or the SDF logo to return to the start screen; strategic and local flight pause with their orders retained. Loading a JSON save opens that patrol paused. Merely visiting the start screen does not create or overwrite an autosave.

## Save games

Open **Saves** in the top navigation. **Save game (.json)** downloads a versioned, readable SDF save. Choose that file and select **Load selected save** to restore it in this browser or another computer running the same save version. Import validates the whole file before changing the current game; malformed, oversized (over 1 MB), and unsupported-version files are rejected. Strategic and local flight restore paused, with their orders retained.

Saves include strategic position and routes, shipboard time, local position and velocity, contact motion, local patrol routes and flight orders, last-known sensor records and IFF identity, target locks, bridge settings, selected destination, and the recent command log. Map zoom, camera, open dialogs, and hover state are not saved.

Browser autosave remains available and now stores the same complete JSON state under `sdf-save-v2` every two seconds, on key actions, and when leaving or hiding the page. Existing version 1 JSON, `sdf-save-v1`, `sdf-navigation-v1` and `sdf-bridge-v1` saves migrate automatically on first use; the old keys are retained as a fallback. Download a JSON file for a backup independent of browser site data. Downloads use the browser's download location; the server does not write save files automatically.

## Combat and damage control

See [COMBAT.md](COMBAT.md) for weapon performance, targeting rules, damage points for all twelve classes, Engineering repairs, spare-parts limits, station service, and current simulation limits. Tactical selects missile targets through **Aim at system**: MP attacks subsystems, GP attacks hulls, subsystems, or incoming missiles, and AS delivers heavy strikes against hulls and ship systems. Radar and jammer choices automatically select the appropriate seeker. Engineering provides damage control and docking. Projectile damage does not drop with distance.

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
- Complete game progress is autosaved in local browser storage and can be downloaded or loaded as a JSON file from Saves. Strategic and local flight resume paused after reload. Browser autosaves are local to this browser and site origin.
- To start over, open Mission briefing and choose Restart patrol at Earth.

## Bridge areas

Three static rectangular HUD panels sit above the forward, port and starboard bridge windows as visual scenery. **HUD** means **Heads Up Display**. Each Tactical MFD has a HUD button in the former Systems position. Click a bridge panel or **HUD · V**, or press **V** from any game view, to open the enlarged HUD popup. Press **V**, **Esc**, or the upper-right **×** to close the popup. HUD ship icons match the radar’s screen size. Track IDs appear in hover / focus details instead of labels on the plot; locked ships retain their priority numbers. MFD and popup HUDs all support radar-style hover details and target locking with the same priorities, Ctrl-click toggling, keyboard Enter / Space, and shared locks. Use **↑ Forward**, **← Port**, **→ Starboard**, and **↓ Rear** while focused inside a HUD, or its direction buttons. Each MFD and the popup keep their own viewing direction; the rear HUD has no corresponding panel on the bridge.

The fixed central artificial-horizon mark represents our ship's plane. Contacts above or below it have positive or negative elevation relative to the current bow; the four adjoining 90-degree views cover all bearings. During combat, pale blue-grey blast shields cover the bridge windows and the crew uses the tactical screens. Local contact views are unavailable during EPD transit.

The HUD displays all active simulated weapon fire within a fixed 200 km range and the current viewing direction: triangles for missiles and individual dots for cannon rounds, without trails. Its legend matches the radar's classification and fire keys. Our fire is cyan, friendly fire green, hostile fire red, and unidentified fire amber. Incoming symbols grow as they approach, without brackets. These tracks use the existing projectile simulation, impacts and interceptions. Missed shots that the combat model resolves immediately do not leave persistent tracks. Motion follows the ship's bow and elevation, updates each simulation frame, and pauses with local flight; the bridge panels remain static scenery.

Bridge Command shows the bridge in an elevated perspective cutaway, with an angular forward window and glazed port and starboard walls inspired by the ship reference models. Nine crew chairs serve Flight Control, Tactical / Security, Comms, and Engineering / Support. Science sits with Engineering / Support. A raised central chair belongs to the commander. Select a console bank or its label to open its station. The view supports keyboard navigation and offers station buttons on phones.

Select **Bridge Command**, **Flight Control**, **Tactical**, **Comms**, or **Engineering** from the top bar. The bar below shows the current location, order, highest active alert, ship time, and simulation controls from every station. Select an alert to open the relevant station. **Bridge Command** puts hull integrity, active alerts, and shuttle status above ship settings and the game guide. Station tabs support Left/Right arrows and Home/End. Phones show area cards in the deck view and **Sector chart / Route & controls** in Local Flight.

Press **B** to open Bridge Command or **F** to open Flight Control. The shortcut and the Flight Control button both open System Map by default and return to the last-used tab.

| Area | Tabs and responsibilities |
| --- | --- |
| Bridge Command | Bridge deck, watch condition, hull readiness, alerts, shuttle status, and ship settings |
| Flight Control | **System Map**: strategic courses; **Local Flight**: route planning, automatic guidance, stopping, and optional advanced manual controls |
| Tactical / Security | **Tactical**: targeting, weapons, countermeasures and maneuvers; **Defense / Systems** in either MFD includes Security's marines, watch condition and emergency isolation |
| Comms | Hails, dispatches, and message history. The top bar shows the unread count |
| Engineering / Support | **Engineering**: reactor power allocation, repairs, damage control, and service; **Science**: sensor assignments and catalog review; **Operations**: resources, teams, and duty priorities; **Life Support**: temperature, life support status, and emergency isolation |

Open **Flight Control → System Map** to plan an EPD course. **Solar System / EPD** opens the same map from Local Flight. A ship without a valid safe course cannot engage. Switching stations or tabs preserves orders and game progress. Existing Navigation and Helm saves reopen in Local Flight with manual settings, motion, and orders retained. Each area remembers its last tab during the session.

Space marines fall under **Security / Defense** for boarding and seizing other vessels and defending our own ship. Each platoon has 40 marines: SDF corvettes, frigates, and destroyers carry one platoon (40); SDF cruisers carry two (80); SDF heavy cruisers carry three (120). The station displays the current ship's confirmed complement. Player shuttle boarding operations are simulated; marine casualties and NPC boarding remain future work.

Pirate frigates and corvettes each carry **40 raiders** and **four assault shuttles**. Raiders fill the same boarding, ship-capture, and defensive role as SDF space marines. Both standard shuttles and assault shuttles carry **10 marines or raiders per craft, excluding the flight crew**; four assault shuttles therefore carry all 40 raiders in one lift. Identified ship details and the class catalog show these complements and capacities. Pirate shuttle operations remain setting data; player launch, boarding, capture and recovery are available through Tactical.

Open **Tactical → Defense / Systems → Shuttle Ops**. Choose a live ship in the shuttle target selector or lock it on Radar or HUD. Select **Capture Ship**, **Explore / Search**, or **Assist Crew** on a ready shuttle to launch. A launch carries 10 marines from the confirmed complement and starts the local simulation.

Each deployed shuttle has a **Recall** action in Tactical **Shuttle Ops**. Recall works during approach or boarding; the button stays disabled while the shuttle returns. The craft must reach our moving ship before it is ready again, so hold a manageable course for recovery. Launch, entry, resistance, completion, recall, and recovery appear in the **Shuttle control** channel in Comms. Completion and recovery reports can reopen the original ship contact in Flight Control while it is still available in the current encounter. Shuttle state and reports survive saves. EPD is unavailable until every shuttle returns.

Deployed shuttles appear as light-blue circles on Radar and both versions of the HUD. Hover a circle for the shuttle number, status and distance. The markers follow the shuttle through approach, boarding and return, and disappear on recovery. Radar uses its selected range; HUD uses its current direction and 200 km coverage.

Boarding does **not** require the target to have a hangar. Cooperative ships use a hangar or external hatch; resisted entry uses a sealed hull-cutting collar. Provisional timing uses 1.2 km/s shuttle pursuit within 10 km launch range (3D ship-to-ship separation; exactly 10 km is allowed), 10 / 15 / 30 seconds for hangar / hatch / cutting entry, and 60 seconds for capture or 45 seconds for exploration / assistance. Capture teams combine their strength against remaining resistance; surrendered ships or ships with disabled bridge, power or reactor offer no organized resistance. Otherwise resistance is the class's marine / raider complement (minimum 10), scaled by hull integrity with a 25% floor. Teams hold at the entry point when outmatched and can be reinforced or recalled. Captured ships secure weapons and display as friendly contacts; the player retains command of their own ship. Exploration reports class, hull and emergencies. Assistance contains fire and seals pressure loss without repairing hulls or replenishing ammunition. Teams return automatically after completion. Individual boarding firefights, casualties, prize-ship piloting, shuttle weapons and shuttle damage are not yet simulated.

High automation keeps ship crews small. Both SDF and pirate ships use androids as crew and in their space-marine / raider forces for routine and dangerous duties. Androids count within crew and boarding-force complements, rather than adding extra personnel to the confirmed totals. They can be injured or destroyed. Because androids are expensive, they may make up **no more than 30% of each crew or combat team**, rounding down to whole personnel. A 40-person platoon / raider team allows at most 12 androids; the cruiser’s 80 marines allow at most 24; the heavy cruiser’s 120 allow at most 36, with the same 30% cap applying to each constituent team. These are ceilings, not assigned android headcounts. Exact crew sizes and actual human / android proportions are not yet specified; individual personnel injuries, destruction, and replacements remain future simulation work.

### Communications

Open **Comms** to contact **Earth HQ / Sol Command**, every moon, outer-patrol, and mining station, Mars colony, or a live ship within the selected Tactical radar range and sensor coverage. HQ and stations use a system relay; ship hails are unavailable during EPD transit. A damaged communications array or loss of main power prevents transmission.

Choose a channel, choose a **Request / response**, optionally add details, and **Transmit message**. Requests include status, patrol reports, assistance, offers of aid, escort, threat reports, orders from HQ, station docking / repairs / resupply, and cease-fire or surrender demands to adversaries. Acknowledge, accept / decline assistance, and free-text messages are also available. Custom text is recorded and acknowledged; specific request types drive contextual replies.

Received messages appear in each conversation with shipboard timestamps. Damaged ships can send distress calls, unread counts appear on the station selector, and the directory filters unread, ship, station, and historical channels. The latest 200 sent and received messages and read states are included in JSON saves and browser autosaves. Ship history remains readable after range loss or leaving a sector, but old encounter channels cannot transmit to a new training contact with the same track number.

Strong hostile ships reject surrender demands. Hostiles at 40% hull or below, or with all weapon mounts destroyed, accept: their weapons and emitters are secured, hostile retaliation and player continuous fire against that ship stop, and surrender persists in saves. Accepted cease-fire requests stop only that engagement. Existing projectiles remain in flight and ship velocities are preserved.

Replies are immediate simulated exchanges. Standard assistance and escort requests do not dispatch ships or transfer repair teams, parts, or fuel; replies explain available station services and current support limits. **Request resupply / repair ship**, available on HQ and station channels or through Engineering, dispatches a repair tender for an actual rendezvous and service. Friendly SDF ships also offer **Attack my targets**, **I need assistance in this battle**, and **Cease fire / stand down** for actual fire support, as described below. Docking and service controls remain in Engineering.

### Local flight: route planning and optional manual controls

Local Flight combines route planning and ship control in one three-dimensional sector simulation. Click the chart to add stops and choose **Fly route**; autopilot handles acceleration and braking, including stopping-corridor checks for hazards supplied by a scenario. **Stop ship** brakes to rest. Tactical uses the same flight state: select a target, choose **Intercept** (5 km standoff), **Match velocity**, **Maintain range**, **Open distance**, or **Break away**, then execute. Range orders accept 5–200 km and apply to the active target even when multiple contacts are locked. The footer shows the shared maneuver, actual range, requested range where applicable, relative closure, and ship speed. Unlocking a target does not cancel an already executing flight order.

Local Flight offers 100, 250, 500, 1,000, and 2,500 km map radii (up to 5,000 km across), top X/Y and rear X/Z projections, current 200 km radar coverage, 60-second trajectory predictions, hazards, and eight patrol waypoints. **Enter coordinates (optional)** accepts explicit X/Y/Z sector waypoints. The chart follows the ship with fixed sector axes; Tactical rotates its local frame with the bow. Bow tracking points at the maneuver target independently of the flight velocity. Current sensor tracks use the same classification shapes as Tactical. Contacts that leave radar coverage retain a hollow last-known position with its age; unknown identity stays unknown. Losing a maneuver target beyond 200 km cancels guidance and coasts. Verified IFF identity is retained after a contact passes beyond the 100 km identification radius.

**Manual controls (advanced)** is collapsed by default. It provides signed thrust, thrust bearing and elevation, and independent bow bearing. **Apply manual controls** cancels autopilot. Zero thrust preserves momentum; **Cancel maneuver / coast** retains current velocity, while **Stop ship** actively brakes. Automatic guidance stops when the predicted stopping/command corridor intersects the 3D debris exclusion zone; it asks for a waypoint around the hazard rather than calculating a detour. Manual controls bypass that protection. The provisional maximum speed is 7,200 KPH and acceleration is 120 KPH per simulated second. Collision damage is not implemented. Weapons, equipment damage and repairs are described in COMBAT.md.

Local simulation starts paused and runs when a maneuver, patrol, or manual order is issued. The shared controls offer 0.5×, 0.75×, 1×, 10×, and 60× in local flight and switch to the EPD rates during transit. Both modes advance the same shipboard clock. Hidden browser tabs suspend local advancement. EPD engagement suspends local flight and prevents local orders during transit. Final EPD arrival or abort initializes a randomized local encounter at that destination; restarting patrol resets the initial Earth training encounter and locks. Local positions, velocities, orders, patrol routes, target locks, and sensor memory persist in autosaves and JSON save files alongside strategic navigation and bridge preferences. Contact traffic follows constant-velocity courses rather than orbital motion.

### Tactical MFD buttons

Tactical has two independent multifunction displays (MFDs), each with the same eight buttons flanking its center screen. The left-side buttons show **Radar**, **Targets / Tracking** (locks, priorities, range, speed, elevation and closure together), **Ship info**, and **HUD** (Heads Up Display). The right-side buttons show **Weapons**, **Defense / Systems**, **Maneuver**, and **Settings**. Defense / Systems combines electronic warfare and defense controls with the selected target's system status, shuttle facilities, boarding force and crew information. Each MFD changes its own screen without a popup or changing the other MFD's view. The left starts on Radar and the right on Targets / Tracking; both can show radar or the same interface simultaneously. Each HUD retains its own viewing direction. Each radar retains its own pan and zoom, while coverage range, target locks, weapon selections, and combat state are shared. Long interfaces scroll within their screen. Narrow screens stack the two MFDs while retaining both button rails.

The compact bezel buttons retain their numbers and use icons; their names appear on hover or keyboard focus. Each MFD uses a single-line header with its side and current interface, leaving more room for the screen.

Security shares the **Defense / Systems** screen instead of a separate bridge tab. Radar, CIWS, jammer, burn-through, watch condition, fire isolation, bulkhead sealing and damage control use icon buttons with hover and keyboard-focus descriptions. Active radar, automatic CIWS, emitting jammer and heightened watch highlight their icons. Compact headings, padding and columns keep Security and the selected target's expanded integrity, shuttle, boarding and crew information together at a 1452 × 884 desktop viewport. Smaller screens retain scrolling where needed to keep text readable. Existing Security station saves reopen in Tactical with watch settings and patrol progress retained.

Radar range, Center, and Reset zoom are inside each Radar screen; Center and Reset zoom apply only to that radar. The Lock target selector is inside each Targets / Tracking screen, and the Armament catalog button is in Settings. HUD always covers 200 km without range buttons, independently of the selected Radar range. HUD contacts within that coverage can be locked even outside the current Radar range; target locks remain shared between the MFDs and popup.

### Arrival encounters

Sol Command and stations send randomized assignments during a patrol. The incoming Comms popup offers **Dismiss** or **Open Comms**. Reading the assignment reveals a red **X** on the System Map. Select the X or use **Show on System Map** in the message, then select **Add to course** and engage EPD. The ship drops out of EPD at the assignment even if more waypoints follow it.

Assignments include protecting a station's evacuation transport, defending a cargo ship, sweeping a patrol sector, and searching for a missing freighter. Objectives and results appear in Comms. One assignment is open at a time. During a sweep, keep moving with radar active and investigate distress signals or hostile activity. In a quiet sector, Sol Command may clear you to keep sweeping or return to Earth. If you stay, watch Comms for a new assignment or orders to return. A return order pauses dispatches until you reach Earth. Sweep progress and assignment messages survive saving and loading.

After a regular assignment closes, the next dispatch comes after 30 simulated minutes. Select **Request orders** on the Sol Command channel to ask for a new assignment sooner.

After traveling to another location, Tactical and Local Flight show a fresh mix of ships, positions, courses, names, and registries. The watch can encounter commercial traffic, cargo convoys, SDF patrols, civilian distress beacons, suspicious armed traffic, or quiet sectors with few or no ships. Inner-system destinations favor traffic; mining stations have more distress and pirate encounters; outer systems and deep space can be quieter. Earth arrivals have no pirate encounters. The event report above Tactical Radar explains the local watch. Expand the radar range to inspect more distant contacts; normal sensor coverage and IFF still determine what is visible and identified.

Distress events include a damaged civilian ship with disabled engines and a Comms distress call. Select **Open contact in Flight Control** on the call, then **Intercept** to approach the ship. Within 10 km, open **Tactical → Defense / Systems → Shuttle Ops** and select **Assist Crew** on a ready shuttle. Suspicious encounters can include pirates prepared to attack when local simulation runs. Arrival starts paused so you can assess the sector. Traveling again creates a new encounter, including return visits; reloading preserves the current encounter, damage, motion, identity assessments, and event. Existing version 1 and 2 training saves remain loadable. Your own ship's damage, ammunition, and supplies carry across arrivals. Generated contacts are local encounters, without persistent interplanetary NPC travel.

Tactical opens a weapons interface with one enlarged **Tactical Radar**, showing the **top (X/Y)** view. +X is starboard, +Y is forward, and +Z is above the ship. Select **10, 30, 60, 100, 140, or 200 km** to set its radius. The radar has three intermediate rings at 25%, 50%, and 75% of range plus the outer range circle. The ship remains centered. Unknown contacts use yellow diamonds, neutral contacts grey triangles, friendly contacts green circles, and enemies red squares. Each track has an arrowed direction line projected from its velocity onto the top view; the line indicates direction, not speed or distance traveled. Hover or keyboard-focus a contact to see distance in KM, speed in KPH, and signed elevation: positive Z / above is green, negative Z / below is red, and zero is neutral. Signed Y separately identifies in front / behind using the same colors. Radar and HUD hover readouts show **Integrity Remaining** for every live, identified ship. Hull, Weapons, Sensors, and Engines appear green above 70%, yellow from 40–70%, and red below 40%. Weapons and Engines combine the remaining points across all mounts or engines. Hover or keyboard-focus our ship at the radar origin for the same integrity summary, plus its name, class, speed, and radar/jammer status. Right-click still opens combat maneuvers.

The hover readout also shows **Vc**, the closure rate in KPH: **positive / Closing** means approaching our ship; **negative / Opening** means moving away. It uses the complete 3D line-of-sight projection `Vc = -(position · relative velocity) / distance`, independently of radar view and display range. Hover speed is relative speed; the shared flight footer shows our ship's sector speed. Vc rounds to whole KPH; a value that rounds to zero reads **Steady range**, and coincident positions read **Vc — / Co-located** because a line of sight cannot be defined. Vc remains available for unidentified contacts without revealing their identity.

Missiles inherit their launch ship's momentum and add their own flight speed while steering toward a predicted interception. They can close on a target matching the ship's speed instead of falling backward on the ship-centered radar. Launch momentum stays fixed if the firing ship subsequently turns or changes speed. Older in-flight saves adopt the firing vessel's current velocity once to correct their launch frame, without advancing the patrol or resetting ammunition.

Target intelligence and telemetry sit to the left of the radar; weapon selection, aim system, firing, and maneuver controls sit to the right. Each side scrolls independently. Weapon performance, emitters, and simulation settings are expandable so active combat controls remain easy to reach.

Check one or multiple mounts under **Weapons**, then expand a selected mount's **Targeting** to choose its target and aim system. Each mount can use the active radar target or a specific locked contact. **Fire** fires the ready selected mounts; **Start firing** gives each selected valid mount its own continuous order, retaining its assigned target and firing cadence. The **30 mm CIWS is belt-fed from a drum**, sustaining 3,000 rounds/minute at full condition without a separate reload pause. Its automatic missile engagements use up to 75 rounds over 1.5 seconds at full condition and immediately engage the next threat; the final rounds in the drum remain usable. **Cease all fire** stops every player firing order and unchecks every mount. Active orders survive JSON saves and reload paused. Unchecking a mount stops its continuous-fire order. Checking it again selects it for the next command without restarting fire.

**Missiles and autocannons have no combat reload pauses.** Their firing/launch cycles enforce the listed rates while using finite ammunition. When empty, visit a suitable station and request service, or choose **Request resupply / repair ship** in Engineering or on an HQ/station Comms channel if the ship cannot get there. A green **TENDER** marker approaches over local simulation time, waits for a safe rendezvous below 10 KPH, repairs the ship, then replenishes ammunition and spare parts. The estimate is roughly three simulated minutes from the current position, followed by repair time and a 60-second ammunition-transfer period. Waiting alone or issuing the request does not refill stocks. Tender progress survives saves; Engineering can cancel the rendezvous or service.

**Engage ship(s)** directs autocannons (and any rail guns) to destroy enemy **CIWS mounts** before launching missiles at that ship. Missiles wait while CIWS survives, including when guns are out of range or offline; manual weapon orders can override the hold. Once CIWS is destroyed, Tactical attacks an active **radar jammer** with **autocannons and/or MP missiles**, holding AS missiles until the jammer is destroyed or silent. Then it targets offensive weapons. Fire stops for a ship that surrenders, loses main power or hull, or has no working offensive mounts with ammunition. Engine loss alone does not end the engagement. Remaining selected threats stay engaged in priority order; already-fired projectiles continue. Pirates use autocannons against CIWS, then autocannons and **GP missiles** against the jammer. Our own CIWS remains on missile defense. Active radar jamming can make incoming missiles miss completely with no damage; anti-jammer missiles home on that emitter.

**Missile volley size**, available in Fire Control and the quick-fire popup, selects **1, 5, 10, or 15 missiles per launcher** for both manual and Tactical firing. Tactical defaults to **1 missile at a time**; the captain can choose more during an active order. The setting persists in saves and across encounters. Each missile can miss or be intercepted independently. Low stocks fire the remaining missiles, and the time between volleys scales with the number launched to preserve the listed firing rate. The fire-button hover text is **Fire**.

**Cannon burst size** sits beside Missile volley size in both panels, with number-only options **1, 5, 10, or 20** and a default of **5 total shells per autocannon mount**. Shells fire one at a time at the mount's firing rate, each with its own hit check and trajectory. Manual Fire stops at the selected count. Tactical and Start Firing repeat the burst after the normal firing cycle plus a **2-second pause**. The captain can change the next burst's size or cancel an unfinished burst with Cease Fire or by unchecking the mount. Both size settings and unfinished bursts persist in saves; encounter changes cancel unfinished bursts while retaining preferences. Low stocks use only the remaining ammunition. Rail guns and CIWS retain their own firing cycles.

**Electronic warfare:** jamming reduces targeting quality and can break precision locks, causing weapons to wait without spending rounds and tracking-dependent maneuvers to coast. **GP / MP missiles and autocannons** can attack jammer hardware; missiles home on an active emitter or use precision guidance against a silent jammer. Gold dashed radar rings identify emissions, with track quality in the target and hover readouts. **Radar burn-through** provides **15 seconds** of restored tracking at the default **33% sensor allocation**, with **180 seconds between uses**. Engineering sensor allocation scales the pulse duration. Burn-through requires active radar and operational power and sensors. It does not extend radar range or disable the enemy jammer. AS, MP and GP missiles also have **IR / heat tracking within 20 km** of a warm powered target, improving close-range resistance to jamming; distant missiles can still lose guidance before reaching IR range.

Ships normally keep jammers **AUTO · SILENT** outside combat. Automatic jammers activate only for engaged ships, then stop when combat ends. The player can cycle **AUTO → ON → SILENT**. Emitting outside combat draws attention: it exposes a ship to passive receivers beyond their usual passive radar coverage, without granting its identity or automatically starting a fight. Jammer mode, burn-through cooldowns and missile guidance assessments persist in saves.

Internal systems stay greyed out until target hull reaches zero. Destroyed aim points turn red and become unselectable; each dropdown and continuous-fire order advances to the next available compatible aim point. A zero-hull ship remains disabled while its surviving internal systems can still be attacked. AS missiles can continue firing at surviving systems after the hull reaches zero.

**Right-click an enemy, neutral, or unknown radar contact** to open compact fire control beside it. The popup lists mount checkboxes with an aim-system dropdown beside each, plus individual **Fire** and **Start Firing** buttons for every mount. Each individual button selects and commands only that mount; group buttons command all checked mounts. It shares selections, aim settings, availability, and live firing status with the right-hand column, which also has individual mount buttons. Unchecking a weapon stops its continuous fire. **Cease All Fire** in either panel stops all player fire orders and unchecks every weapon. Opening the popup assigns the clicked ship to those mount controls for new commands and preserves other radar locks; existing firing orders keep their assigned targets until you issue another command. Close it with **×**, an outside click, or **Escape**. A focused radar contact also opens it with **Shift + F10** or the keyboard context-menu key.

**Right-click a green friendly SDF ship** for **SDF ship commands**, without opening priority selection or changing your radar locks. Choose **Attack my targets**, **I need assistance in this battle**, **Cease fire / stand down**, or **Report your status**. Attack transmits your live, identified hostile locks in priority order; battle assistance requests support against confirmed threats without requiring locks. The ship accepts or refuses based on its condition, allegiance, weapons, ammunition, and range, with its reply shown in the popup and saved in Comms. Accepted support starts local time and fires the ally's own weapons; hostile ships can return fire at that ally. Ships retain their existing courses. Stand down cancels that ally's support order but cannot recall projectiles already in flight. Support stops for surrendered or disabled targets and allies needing critical damage control; orders persist in saves and clear on EPD departure or a new encounter. Keyboard context-menu access, Escape, and outside-click dismissal also work.

**Right-click our ship at the radar center** to open **Combat maneuver** beside it. Choose a maneuver and engagement range for the active locked target, then execute. **Hard a Port** turns the bow left 40°; **Hard a Starboard** turns it right 40°. Each execution turns relative to the current bow, works without a target lock, and preserves velocity, flight orders, and the paused/running state. Hard turns suspend automatic bow tracking so the new orientation holds; issuing another target maneuver resumes tracking. The popup shows the current bow bearing. The same maneuver controls are available through the right-side Maneuver button. Target maneuvers require a live target within the selected radar coverage; all maneuvers are unavailable during EPD transit, while docked, or without working engines. Close it with **×**, an outside click, or **Escape**; focus our ship and press **Enter**, **Space**, **Shift + F10**, or the context-menu key for keyboard access.

**Left-click** a contact on radar or HUD to select and lock only that target, replacing the previous selection, and make its ship details available through the left MFD buttons. New locks from the radar, HUD, or target selector receive the lowest available priority from 1–12, with 1 highest. Right-click fire control still prompts when acquiring a new ship. Larger locked-contact symbols show the priority number in their center. **Change priority** edits the active ship's number, and the locked-target list is sorted by priority. Priorities persist in JSON saves and autosaves; older saves assign unique numbers in their existing lock order.

**Ctrl + left-click** adds an unselected contact or deselects/unlocks an already selected contact while preserving the other locks. **Ctrl + Enter / Space** provides the same toggle from a focused track. Inspecting a ship through the locked-target list retains the other locks; Ctrl-clicking its button releases it. Releasing a lock frees its number without renumbering remaining ships. **Release all target locks** explicitly clears the selection and priorities. Contacts beyond the selected three-dimensional range disappear from the plot; their locks and priority numbers remain reserved with an out-of-range notice. Narrow screens retain the eight MFD buttons; a normal contact tap assigns its priority immediately. The range setting persists locally.

**IFF** verifies a contact's identity and ship type with an approximately **90% success chance within 100 km**, measured in three dimensions from our ship. Each track gets one stable assessment; changing display range, locking, or refreshing the page does not reroll it. The training encounter includes one unsuccessful nearby IFF return. Unidentified contacts are yellow diamonds with generic TRK identifiers, unknown ship type and size, and no disclosed name, registry, affiliation, role, armaments, or engines. Their measured distance, speed, direction, and position remain available. Confirmed contacts show their verified classification and provisional size class. Contacts first observed beyond the 100 km identification radius have no confirmed IFF identity until they enter that radius and pass the stable assessment.

Open **Ship info** and click an identified ship type to open its **five-view reference**. All twelve types use their matching existing `images/*-five-view.png` composites, shown in full with top, side, bottom, front, and rear views. Close with the × button, Escape, or a backdrop click; **Full-size image** opens the original PNG. Unknown types have no reference button or image, preserving IFF uncertainty. Viewing a reference leaves target locks unchanged.

The ship library also includes **SPF LOGISTICS TENDER**. Open **Bridge → Tactical / Security → Tactical → Armament catalog**, select **SPF LOGISTICS TENDER** under **Ship class specification**, then choose **View five-view reference**. The original PNG is available through **Full-size image**. Its confirmed equipment is two 30 mm CIWS, one 120 mm autocannon, 20 ventral MP missiles in vertical launch tubes, two main engines, and a rear-facing hangar for six repair shuttles with two launch lanes aft and two on each side. Repair-shuttle operations are reference data; the tender is available in the ship library.

### Planetary chart references

Local Flight also shows the destination planet and its existing station moon (Moon, Phobos, Ganymede, Titan, Titania, or Triton). **Planetary overview** fits the bodies and ship together; **Center on ship** restores the 220 km local chart. Off-chart bodies have edge markers, and the controls list distances to their surfaces. Body sizes use rounded NASA/JPL radii; tiny bodies have a minimum visible marker. Moon separations and illustrative directions reuse the strategic settlement chart. Arrivals place the training-frame origin 100 km above the destination body's +X limb. These fixed chart references provide position and distance. Automatic guidance checks hazards supplied by the active scenario. Deep-space and mining sectors have no planetary references. Plot patrol waypoints at local ranges within the existing ±100,000 km coordinate limit.

### Armament catalog and confirmed class fits

Open **Armament catalog** from Tactical or the ship armaments section. The shared catalog contains seven types: Anti-ship (AS) missiles, Multi-purpose (MP) missiles, General Purpose (GP) missiles, 120 mm Autocannon, 75 mm Autocannon, 30 mm CIWS, and Rail Gun. The cruiser has one turret-mounted Rail Gun; the heavy cruiser has two Rail Guns in one turret. Provisional weapon performance and guidance appear in the catalog and COMBAT.md. Ship loadouts reference stable catalog IDs so more types can be added later. Use **Ship class specification** in the catalog to browse the confirmed SDF frigate, destroyer, cruiser, and heavy cruiser fits and both pirate class fits. These public class references do not identify an unknown radar contact. The default is our ship's SDF frigate specification, also shown for identified SDF frigate contacts:

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

The confirmed **pirate corvette** and **pirate frigate** fittings are also available in the class catalog:

| Equipment | Pirate corvette | Pirate frigate |
| --- | --- | --- |
| 120 mm Autocannon | 1 forward turret, 1 gun | 2 single-gun turrets: forward and aft atop the shuttle hangar |
| GP missiles | 30, ventral launch / bottom | 40, ventral launch / bottom |
| 30 mm CIWS | 2: 1 port, 1 starboard | 2: 1 port, 1 starboard |
| Countermeasures | Chaff, flares, radar jammer | Chaff, flares, radar jammer |
| Assault shuttles | 4 in 1 bay | 4 in 1 bay |
| Raiders | 40 | 40 |
| Engines | 2 | 2 |

Countermeasures, shuttle facilities, and engines appear in separate sections in the class catalog and identified ship details. Engine models and EPD ratings remain provisional. SDF ships start with 30 charges each of chaff and flares, and pirate ships start with four each. Civilian and privateer fittings remain provisional and have no assigned weapon quantities. Unidentified contacts retain unknown armaments, countermeasures, shuttle facilities, and engines. Ammunition, firing, ranges, damage, repair and automatic CIWS are simulated. Player boarding shuttle launch and recovery are simulated. NPC shuttle operations remain future work. Port and starboard CIWS mounts intercept missiles on their respective sides. Existing saves migrate the earlier pirate fits without resetting player progress; see COMBAT.md for the migration rules.

A new patrol starts at Earth with ten contacts. Civilian traffic includes four UNE cargo and transport classes, a privateer, and a private yacht. The SDF patrol includes a frigate, destroyer, cruiser, and heavy cruiser. Set 200 km initially to see every contact; IFF determines which identities are revealed. Ship names, registries, size classes, and engine models are provisional fictional data. Armaments use the shared catalog; all four SDF and both pirate class fittings and engine counts are user-confirmed, while civilian and privateer fittings remain provisional. Weapons, damage, return fire, repairs, finite spares and station service are available. Autonomous hostile patrol AI, internal force fields and detailed crew/resource simulation remain future systems. Science reviews the existing navigation catalog rather than generating new discoveries. Communications reports are written to the shipboard log; no external messages are sent. Nominal engineering/support readouts describe the prototype's starting condition. Temperature is an editable setpoint; atmosphere at 101 kPa and artificial gravity at 1.0 g are provisional defaults, without a simulated crew-health model.

The bridge roles follow the user's supplied Star Trek reference, adapted to SDF's 2100 cold fusion and EPD setting. Warp drive, impulse engines, phasers, photon torpedoes, and subspace communications are not established SDF technology by this prototype.

New unread communications display a popup with the sender and subject. **Open Comms** closes the popup and opens that channel; the upper-right **×** dismisses the popup while leaving the message unread. The envelope in the top bar turns amber and shows the unread count until those channels are read. Select the envelope from any game view to open an unread channel. Loading a saved patrol restores its unread indicator without replaying old message popups.

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

Titania was selected because it is larger than Oberon ([NASA](https://science.nasa.gov/uranus/moons/titania/)). Neither is assumed to be safer overall; advanced shielding is part of the game's setting. Moon-to-parent separations use rounded [JPL mean orbital radii](https://ssd.jpl.nasa.gov/sats/elem/), with fixed illustrative directions. The colony's surface offset is illustrative. These locations are not an ephemeris for 2100.

### Asteroid-belt mining

Sixteen commercial mining stations operate between 2.2 and 3.3 AU, each selectable as a patrol waypoint. Hexagonal pickaxe symbols distinguish mining stations from the standard crossed-diamond station symbol used at moon stations and Heliopause. Their map labels appear on hover or keyboard focus. The **Mining** directory shows four stations per page and can filter by company. Selecting a mining station exposes a **Contract** button with its owner, government issuer, contract number, and active status.

| Mining company | Owned stations |
| --- | --- |
| Asterion Resource Group | Alpha, Beta, Gamma, Delta |
| Helios Deepcore Industries | Epsilon, Zeta, Eta, Theta |
| Peregrine Beltworks | Iota, Kappa, Lambda, Mu |
| Vulcan Frontier Mining | Nu, Xi, Omicron, Omega |

The United Nations of Earth government awards the mining contracts. Each of these sixteen stations has a distinct active UNE contract. Company names, station names, placements, and contract numbers are part of the fictional 2100 setting. Greek-letter names are written in the Latin alphabet, with Omega included among the sixteen selected names.

Future setting note: freelance miners who supply pirates exist in the setting and will be developed in a later phase. Freelance mining, pirate supply chains, and contract-awarding gameplay are not simulated in Phase 1.

### World and navigation

The user is captain of an SDF vessel patrolling the Solar System in 2100. Cold fusion was achieved around 2050. Electromagnetic Pulse Drives, inertial dampeners, and advanced protective materials enable travel across the system in just over a month.

Provisional details for review: the Vanguard-class frigate, a heliopause station at a 120 AU patrol boundary, and a nominal cruise rate of 3.8 AU/day (approximately 31.6 days for a radial 120 AU crossing). This boundary represents the prototype patrol area, not a claim that the Solar System ends there.

The Sun stays at the origin. The overview uses a logarithmically compressed radial scale to keep all planets readable; its square grid is a display reference, not uniform AU cells. Navigation coordinates, travel distances, and ETAs use a separate AU coordinate space. Curved-looking map routes are straight legs in this physical coordinate space. Planet positions are illustrative, not an astronomical ephemeris for 2100, and remain fixed in this prototype. Strategic EPD acceleration, orbital interception, moving astronomical bodies, weapons combat, supplies, and crew simulation are reserved for future phases. Local sector maneuvers use the separate kilometer-scale Vector Drive model described above; their displacement is not drawn on the compressed heliocentric chart.

The application runs without third-party JavaScript dependencies or external assets. Optional Google Fonts enhance the typography when available; local system fonts provide fallbacks. No data is sent to a server or external game service.

## Ship names

Choose your frigate's name in **New Mission**, or change the current ship under **Bridge Command → Ship name**. The selector offers names that follow the UNE military naming convention; SDF keeps its existing service prefix. The chosen name appears on the bridge, strategic and local charts, Tactical, new Comms messages and save headers, and persists in portable saves and browser autosaves. Historical Comms messages keep the name used when they were sent. The default frigate name is **SDF Andes**.

| Ship class | UNE naming convention |
| --- | --- |
| Heavy cruiser | National capitals |
| Cruiser | States, provinces and regions |
| Destroyer | Large world cities |
| SDF frigate | Geographical features around the world, including mountains, rivers, deserts and reefs |

New military encounter names and the training military ships use these categories. SDF frigate choices include Andes, Himalaya, Kilimanjaro, Sahara, Amazon, Nile, Great Barrier Reef and Grand Canyon. Older player frigate names convert to valid geographical names when loading a save, preserving patrol progress. Older generated encounters retain their versioned identities and motion when loaded. Pirate frigates and corvettes continue to use the separate pirate list. The current playable ship is still a frigate; naming does not change its class, equipment or mission progress.

New pirate encounters draw from the supplied 50-name list, including **Space King** and **Space Nymph** in place of Sea King and Sea Nymph. Names appear without numeric suffixes and do not repeat within an encounter. Training pirates use **The William** and **Happy Delivery**. Generated encounters from earlier versions keep their original names when loaded.

## Enemy morale and escape

Engaged enemies can now retreat or offer surrender on their own. Pirates usually withdraw earlier than SDF crews. Retreat can follow unfavorable hull damage around 60% for pirates, depleted / disabled offensive weapons, or losing CIWS and jammer under sustained missile attack. Retreating ships accelerate away with their surviving engines, stop offensive fire, and keep defensive CIWS and jamming available. Cornered ships surrender at critical hull condition (40% or less), exhausted weapons or a severe onboard emergency. A retreat blocked for 20 simulated seconds can also force surrender. Existing momentum and projectiles remain intact.

Surrender stops player and allied automatic fire against that ship while preserving other targets. Tactical labels the response and Comms reports the event once. A ship that leaves actual sensor coverage becomes **contact lost**, retaining its last-known position; it can be reacquired, and escape is not falsely confirmed. NPC EPD escape remains future work. Responses, movement and message state survive saves. See COMBAT.md for the exact thresholds and stable per-ship variation.
