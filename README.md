# Sol Defense Force — Phase 1

A local, interactive first look at the strategic navigation map for SDF, set in 2250.

## Run

Requires Node.js. No dependency installation is needed.

```sh
npm start
```

Open http://127.0.0.1:2250. Run navigation checks with `npm test`.

The start screen offers **New Mission**, **Load Saved Game**, **History** (setting and backstory), and **How to Play**. **Continue** appears when a browser patrol is available. New Mission opens a briefing before replacing the browser autosave, with an option to download the current patrol first. **New Campaign** explains that campaign progression is not yet implemented and links to the playable mission. Use **Menu** or the SDF logo to return to the start screen; strategic and local flight pause with their orders retained. Loading a JSON save opens that patrol paused. Merely visiting the start screen does not create or overwrite an autosave.

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

Open **Bridge** in the top navigation to return to the deck and select an area. The deck controls include each area's icon and a description of its duties; consoles use the space previously occupied by the area directory. **Command** is the overview for readiness, current orders, alerts, and shortcuts. Four bridge areas combine the existing controls behind internal tabs, which support Left/Right arrows and Home/End. Phones show readable area cards in the deck view and offer a Command overview switch. Local Flight provides **Sector chart / Route & controls** views on phones.

| Area | Tabs and responsibilities |
| --- | --- |
| Command | Overview: command seat, watch condition, hull readiness, orders, location, and alerts |
| Flight Control | **System Map**: strategic courses; **Local Flight**: route planning, automatic guidance, stopping, and optional advanced manual controls |
| Tactical / Security | **Tactical**: targeting, weapons, countermeasures and maneuvers; **Security**: marines, watch condition and emergency isolation |
| Science / Comms | **Science**: sensor assignments and catalog review; **Comms**: hails, channels and messages, with unread counts on the deck control and Comms tab |
| Engineering / Support | **Engineering**: automatic repairs, damage control and station service; **Operations**: resources, teams and duty priorities; **Life Support**: temperature, life-support status and emergency isolation |

Local Flight’s optional EPD transit controls use the same navigation state and safety checks as the strategic map. A ship without a valid safe course cannot engage. **Solar System / EPD** opens Flight Control’s System Map. The top-level **Strategic map** shortcut opens the same map and flight plan outside the bridge. Switching areas, tabs, or map locations preserves orders and game progress. Existing Navigation and Helm saves reopen in Local Flight, retaining manual flight settings, motion, and orders. Other station selections, command seat, watch condition, duty priority, sensor assignment, and habitat temperature remain saved. Each area remembers its last tab during the session.

Space marines fall under **Security / Defense** for boarding and seizing other vessels and defending our own ship. Each platoon has 40 marines: SDF corvettes, frigates, and destroyers carry one platoon (40); SDF cruisers carry two (80); SDF heavy cruisers carry three (120). The station displays the current ship's confirmed complement. Boarding operations and marine casualties are not yet simulated.

Pirate frigates and corvettes each carry **40 raiders** and **four assault shuttles**. Raiders fill the same boarding, ship-capture, and defensive role as SDF space marines. Both standard shuttles and assault shuttles carry **10 marines or raiders per craft, excluding the flight crew**; four assault shuttles therefore carry all 40 raiders in one lift. Identified ship details and the class catalog show these complements and capacities. Shuttle launch, boarding, and capture remain setting data until those operations are implemented.

High automation keeps ship crews small. Both SDF and pirate ships use androids as crew and in their space-marine / raider forces for routine and dangerous duties. Androids count within crew and boarding-force complements, rather than adding extra personnel to the confirmed totals. They can be injured or destroyed. Because androids are expensive, they may make up **no more than 30% of each crew or combat team**, rounding down to whole personnel. A 40-person platoon / raider team allows at most 12 androids; the cruiser’s 80 marines allow at most 24; the heavy cruiser’s 120 allow at most 36, with the same 30% cap applying to each constituent team. These are ceilings, not assigned android headcounts. Exact crew sizes and actual human / android proportions are not yet specified; individual personnel injuries, destruction, and replacements remain future simulation work.

### Communications

Open **Bridge → Science / Comms → Comms** to contact **Earth HQ / Sol Command**, every moon, outer-patrol, and mining station, Mars colony, or a live ship within the selected Tactical radar range and sensor coverage. HQ and stations use a system relay; ship hails are unavailable during EPD transit. A damaged communications array or loss of main power prevents transmission.

Choose a channel, choose a **Request / response**, optionally add details, and **Transmit message**. Requests include status, patrol reports, assistance, offers of aid, escort, threat reports, orders from HQ, station docking / repairs / resupply, and cease-fire or surrender demands to adversaries. Acknowledge, accept / decline assistance, and free-text messages are also available. Custom text is recorded and acknowledged; specific request types drive contextual replies.

Received messages appear in each conversation with shipboard timestamps. Damaged ships can send distress calls, unread counts appear on the station selector, and the directory filters unread, ship, station, and historical channels. The latest 200 sent and received messages and read states are included in JSON saves and browser autosaves. Ship history remains readable after range loss or leaving a sector, but old encounter channels cannot transmit to a new training contact with the same track number.

Strong hostile ships reject surrender demands. Hostiles at 40% hull or below, or with all weapon mounts destroyed, accept: their weapons and emitters are secured, hostile retaliation and player continuous fire against that ship stop, and surrender persists in saves. Accepted cease-fire requests stop only that engagement. Existing projectiles remain in flight and ship velocities are preserved.

Replies are immediate simulated exchanges. Standard assistance and escort requests do not dispatch ships or transfer repair teams, parts, or fuel; replies explain available station services and current support limits. **Request resupply / repair ship**, available on HQ and station channels or through Engineering, dispatches a repair tender for an actual rendezvous and service. Friendly SDF ships also offer **Attack my targets**, **I need assistance in this battle**, and **Cease fire / stand down** for actual fire support, as described below. Docking and service controls remain in Engineering.

### Local flight: route planning and optional manual controls

Local Flight combines route planning and ship control in one three-dimensional sector simulation. Click the chart to add stops and choose **Fly route**; autopilot handles acceleration and braking, including a stopping-corridor check against the training debris field. **Stop ship** brakes to rest. Tactical uses the same flight state: select a target, choose **Intercept** (5 km standoff), **Match velocity**, **Maintain range**, **Open distance**, or **Break away**, then execute. Range orders accept 5–200 km and apply to the active target even when multiple contacts are locked. The footer shows the shared maneuver, actual range, requested range where applicable, relative closure, and ship speed. Unlocking a target does not cancel an already executing flight order.

Local Flight offers 100, 250, 500, 1,000, and 2,500 km map radii (up to 5,000 km across), top X/Y and rear X/Z projections, current 200 km radar coverage, 60-second trajectory predictions, hazards, and eight patrol waypoints. **Enter coordinates (optional)** accepts explicit X/Y/Z sector waypoints. The chart follows the ship with fixed sector axes; Tactical rotates its local frame with the bow. Bow tracking points at the maneuver target independently of the flight velocity. Current sensor tracks use the same classification shapes as Tactical. Contacts that leave radar coverage retain a hollow last-known position with its age; unknown identity stays unknown. Losing a maneuver target beyond 200 km cancels guidance and coasts. Verified IFF identity is retained after a contact passes beyond the 100 km identification radius.

**Manual controls (advanced)** is collapsed by default. It provides signed thrust, thrust bearing and elevation, and independent bow bearing. **Apply manual controls** cancels autopilot. Zero thrust preserves momentum; **Cancel maneuver / coast** retains current velocity, while **Stop ship** actively brakes. Automatic guidance stops when the predicted stopping/command corridor intersects the 3D debris exclusion zone; it asks for a waypoint around the hazard rather than calculating a detour. Manual controls bypass that protection. The provisional maximum speed is 7,200 KPH and acceleration is 120 KPH per simulated second. Collision damage is not implemented. Weapons, equipment damage and repairs are described in COMBAT.md.

Local simulation starts paused and runs when a maneuver, patrol, or manual order is issued. Local Flight, Tactical Settings, and Engineering share 0.5×, 0.75×, 1×, 10×, and 60× local time; local time also advances the shipboard clock. Hidden browser tabs suspend local advancement. EPD engagement suspends local flight and prevents local orders during transit. Final EPD arrival or abort initializes a randomized local encounter at that destination; restarting patrol resets the initial Earth training encounter and locks. Local positions, velocities, orders, patrol routes, target locks, and sensor memory persist in autosaves and JSON save files alongside strategic navigation and bridge preferences. Contact traffic follows constant-velocity courses rather than orbital motion.

### Tactical MFD buttons

The enlarged radar is flanked by four equal-size buttons on each side, stacked vertically. The left buttons open **Targets** (locks and priorities), **Tracking** (range, speed, elevation and closure), **Ship info** (identity, reference image, weapons and engines), and **Systems** (target integrity, shuttles, boarding and crew). The right buttons open **Weapons** (mount selection, aim, volleys and firing), **Defense** (radar, CIWS, jammer and burn-through), **Maneuver**, and **Settings** (simulation speed and combat events). Each opens a live popup; close with **×**, **Escape**, or a backdrop click. Selections and orders carry between popups and radar quick controls. The same button layout is available on narrow screens.

### Arrival encounters

After traveling to another location, Tactical and Local Flight show a fresh mix of ships, positions, courses, names, and registries. The watch can encounter commercial traffic, cargo convoys, SDF patrols, civilian distress beacons, suspicious armed traffic, or quiet sectors with few or no ships. Inner-system destinations favor traffic; mining stations have more distress and pirate encounters; outer systems and deep space can be quieter. The event report above Tactical Radar explains the local watch. Expand the radar range to inspect more distant contacts; normal sensor coverage and IFF still determine what is visible and identified.

Distress events include an actual damaged civilian ship with disabled engines and a Comms distress call. Suspicious encounters can include pirates prepared to attack when local simulation runs. Arrival starts paused so you can assess the sector. Traveling again creates a new encounter, including return visits; reloading preserves the current encounter, damage, motion, identity assessments, and event instead of rerolling them. Existing version 1 and 2 training saves remain loadable. Your own ship's damage, ammunition, and supplies carry across arrivals. Generated contacts are local encounters, without persistent interplanetary NPC travel.

Tactical opens a weapons interface with one enlarged **Tactical Radar**, showing the **top (X/Y)** view. +X is starboard, +Y is forward, and +Z is above the ship. Select **10, 30, 60, 100, 140, or 200 km** to set its radius. The radar has three intermediate rings at 25%, 50%, and 75% of range plus the outer range circle. The ship remains centered. Unknown contacts use yellow diamonds, neutral contacts grey triangles, friendly contacts green circles, and enemies red squares. Each track has an arrowed direction line projected from its velocity onto the top view; the line indicates direction, not speed or distance traveled. Hover or keyboard-focus a contact to see distance in KM, speed in KPH, and signed elevation: positive Z / above is green, negative Z / below is red, and zero is neutral. Signed Y separately identifies in front / behind using the same colors. Identified enemy hover readouts also show remaining Hull, Weapons, Sensors, and Engines integrity: green above 70%, yellow from 40–70%, and red below 40%. Weapons and Engines combine the remaining points across all mounts or engines. The percentages update with combat damage; unidentified and stale tracks do not disclose these values. Hover or keyboard-focus our ship at the radar origin for the same integrity summary, plus its name, class, speed, and radar/jammer status. Right-click still opens combat maneuvers.

The hover readout also shows **Vc**, the closure rate in KPH: **positive / Closing** means approaching our ship; **negative / Opening** means moving away. It uses the complete 3D line-of-sight projection `Vc = -(position · relative velocity) / distance`, independently of radar view and display range. Hover speed is relative speed; the shared flight footer shows our ship's sector speed. Vc rounds to whole KPH; a value that rounds to zero reads **Steady range**, and coincident positions read **Vc — / Co-located** because a line of sight cannot be defined. Vc remains available for unidentified contacts without revealing their identity.

Missiles inherit their launch ship's momentum and add their own flight speed while steering toward a predicted interception. They can close on a target matching the ship's speed instead of falling backward on the ship-centered radar. Launch momentum stays fixed if the firing ship subsequently turns or changes speed. Older in-flight saves adopt the firing vessel's current velocity once to correct their launch frame, without advancing the patrol or resetting ammunition.

Target intelligence and telemetry sit to the left of the radar; weapon selection, aim system, firing, and maneuver controls sit to the right. Each side scrolls independently. Weapon performance, emitters, and simulation settings are expandable so active combat controls remain easy to reach.

Check one or multiple mounts under **Weapons**, then expand a selected mount's **Targeting** to choose its target and aim system. Each mount can use the active radar target or a specific locked contact. **Fire** fires the ready selected mounts; **Start firing** gives each selected valid mount its own continuous order, retaining its assigned target and firing cadence. The **30 mm CIWS is belt-fed from a drum**, sustaining 3,000 rounds/minute at full condition without a separate reload pause. Its automatic missile engagements use up to 75 rounds over 1.5 seconds at full condition and immediately engage the next threat; the final rounds in the drum remain usable. **Cease all fire** stops every player firing order and unchecks every mount. Active orders survive JSON saves and reload paused. Unchecking a mount stops its continuous-fire order. Checking it again selects it for the next command without restarting fire.

**Missiles and autocannons have no combat reload pauses.** Their firing/launch cycles enforce the listed rates while using finite ammunition. When empty, visit a suitable station and request service, or choose **Request resupply / repair ship** in Engineering or on an HQ/station Comms channel if the ship cannot get there. A green **TENDER** marker approaches over local simulation time, waits for a safe rendezvous below 10 KPH, repairs the ship, then replenishes ammunition and spare parts. The estimate is roughly three simulated minutes from the current position, followed by repair time and a 60-second ammunition-transfer period. Waiting alone or issuing the request does not refill stocks. Tender progress survives saves; Engineering can cancel the rendezvous or service.

**Engage ship(s)** directs autocannons (and any rail guns) to destroy enemy **CIWS mounts** before launching missiles at that ship. Missiles wait while CIWS survives, including when guns are out of range or offline; manual weapon orders can override the hold. Once CIWS is destroyed, Tactical attacks an active **radar jammer** with **autocannons and/or MP missiles**, holding AS missiles until the jammer is destroyed or silent. Then it targets offensive weapons. Fire stops for a ship that surrenders, loses main power or hull, or has no working offensive mounts with ammunition. Engine loss alone does not end the engagement. Remaining selected threats stay engaged in priority order; already-fired projectiles continue. Pirates use autocannons against CIWS, then autocannons and **GP missiles** against the jammer. Our own CIWS remains on missile defense. Active radar jamming can make incoming missiles miss completely with no damage; anti-jammer missiles home on that emitter.

**Missile volley size**, available in Fire Control and the quick-fire popup, selects **1, 5, 10, or 15 missiles per launcher** for both manual and Tactical firing. Tactical defaults to **1 missile at a time**; the captain can choose more during an active order. The setting persists in saves and across encounters. Each missile can miss or be intercepted independently. Low stocks fire the remaining missiles, and the time between volleys scales with the number launched to preserve the listed firing rate. The fire-button hover text is **Fire**.

**Cannon burst size** sits beside Missile volley size in both panels, with number-only options **1, 5, 10, or 20** and a default of **5 total shells per autocannon mount**. Shells fire one at a time at the mount's firing rate, each with its own hit check and trajectory. Manual Fire stops at the selected count. Tactical and Start Firing repeat the burst after the normal firing cycle plus a **2-second pause**. The captain can change the next burst's size or cancel an unfinished burst with Cease Fire or by unchecking the mount. Both size settings and unfinished bursts persist in saves; encounter changes cancel unfinished bursts while retaining preferences. Low stocks use only the remaining ammunition. Rail guns and CIWS retain their own firing cycles.

**Electronic warfare:** jamming reduces targeting quality and can break precision locks, causing weapons to wait without spending rounds and tracking-dependent maneuvers to coast. **GP / MP missiles and autocannons** can attack jammer hardware; missiles home on an active emitter or use precision guidance against a silent jammer. Gold dashed radar rings identify emissions, with track quality in the target and hover readouts. **Radar burn-through** provides **15 seconds** of restored tracking, with **180 seconds between uses**, requiring active radar and operational power / sensors. It does not extend radar range or disable the enemy jammer. AS, MP and GP missiles also have **IR / heat tracking within 20 km** of a warm powered target, improving close-range resistance to jamming; distant missiles can still lose guidance before reaching IR range.

Ships normally keep jammers **AUTO · SILENT** outside combat. Automatic jammers activate only for engaged ships, then stop when combat ends. The player can cycle **AUTO → ON → SILENT**. Emitting outside combat draws attention: it exposes a ship to passive receivers beyond their usual passive radar coverage, without granting its identity or automatically starting a fight. Jammer mode, burn-through cooldowns and missile guidance assessments persist in saves.

Internal systems stay greyed out until target hull reaches zero. Destroyed aim points turn red and become unselectable; each dropdown and continuous-fire order advances to the next available compatible aim point. A zero-hull ship remains disabled while its surviving internal systems can still be attacked. AS missiles can continue firing at surviving systems after the hull reaches zero.

**Right-click an enemy, neutral, or unknown radar contact** to open compact fire control beside it. The popup lists mount checkboxes with an aim-system dropdown beside each, plus individual **Fire** and **Start Firing** buttons for every mount. Each individual button selects and commands only that mount; group buttons command all checked mounts. It shares selections, aim settings, availability, and live firing status with the right-hand column, which also has individual mount buttons. Unchecking a weapon stops its continuous fire. **Cease All Fire** in either panel stops all player fire orders and unchecks every weapon. Opening the popup assigns the clicked ship to those mount controls for new commands and preserves other radar locks; existing firing orders keep their assigned targets until you issue another command. Close it with **×**, an outside click, or **Escape**. A focused radar contact also opens it with **Shift + F10** or the keyboard context-menu key.

**Right-click a green friendly SDF ship** for **SDF ship commands**, without opening priority selection or changing your radar locks. Choose **Attack my targets**, **I need assistance in this battle**, **Cease fire / stand down**, or **Report your status**. Attack transmits your live, identified hostile locks in priority order; battle assistance requests support against confirmed threats without requiring locks. The ship accepts or refuses based on its condition, allegiance, weapons, ammunition, and range, with its reply shown in the popup and saved in Comms. Accepted support starts local time and fires the ally's own weapons; hostile ships can return fire at that ally. Ships retain their existing courses. Stand down cancels that ally's support order but cannot recall projectiles already in flight. Support stops for surrendered or disabled targets and allies needing critical damage control; orders persist in saves and clear on EPD departure or a new encounter. Keyboard context-menu access, Escape, and outside-click dismissal also work.

**Right-click our ship at the radar center** to open **Combat maneuver** beside it. Choose a maneuver and engagement range for the active locked target, then execute. **Hard a Port** turns the bow left 40°; **Hard a Starboard** turns it right 40°. Each execution turns relative to the current bow, works without a target lock, and preserves velocity, flight orders, and the paused/running state. Hard turns suspend automatic bow tracking so the new orientation holds; issuing another target maneuver resumes tracking. The popup shows the current bow bearing. The same maneuver controls are available through the right-side Maneuver button. Target maneuvers require a live target within the selected radar coverage; all maneuvers are unavailable during EPD transit, while docked, or without working engines. Close it with **×**, an outside click, or **Escape**; focus our ship and press **Enter**, **Space**, **Shift + F10**, or the context-menu key for keyboard access.

**Left-click** a contact on the radar to select and lock only that target, replacing the previous selection, and make its ship details available through the left MFD buttons. New locks first ask for a **Target priority**: **1 is highest**, with a distinct slot from 1–12 for each locked ship. Numbers already assigned to other retained locks are disabled. Confirm applies the lock and priority together; Cancel or Escape leaves the selection unchanged. This also applies to the **Lock target** selector and right-click fire control when acquiring a new ship. Larger locked-contact symbols show the priority number in their center. **Change priority** edits the active ship's number, and the locked-target list is sorted by priority. Priorities persist in JSON saves and autosaves; older saves assign unique numbers in their existing lock order.

**Ctrl + left-click** adds an unselected contact or deselects/unlocks an already selected contact while preserving the other locks. **Ctrl + Enter / Space** provides the same toggle from a focused track. Inspecting a ship through the locked-target list retains the other locks; Ctrl-clicking its button releases it. Releasing a lock frees its number without renumbering remaining ships. **Release all target locks** explicitly clears the selection and priorities. Contacts beyond the selected three-dimensional range disappear from the plot; their locks and priority numbers remain reserved with an out-of-range notice. Narrow screens retain the eight MFD buttons; a normal contact tap confirms its priority before opening Targets. The range setting persists locally.

**IFF** verifies a contact's identity and ship type with an approximately **90% success chance within 100 km**, measured in three dimensions from our ship. Each track gets one stable assessment; changing display range, locking, or refreshing the page does not reroll it. The training encounter includes one unsuccessful nearby IFF return. Unidentified contacts are yellow diamonds with generic TRK identifiers, unknown ship type and size, and no disclosed name, registry, affiliation, role, armaments, or engines. Their measured distance, speed, direction, and position remain available. Confirmed contacts show their verified classification and provisional size class. Contacts first observed beyond the 100 km identification radius have no confirmed IFF identity until they enter that radius and pass the stable assessment.

Open **Ship info** and click an identified ship type to open its **five-view reference**. All twelve types use their matching existing `images/*-five-view.png` composites, shown in full with top, side, bottom, front, and rear views. Close with the × button, Escape, or a backdrop click; **Full-size image** opens the original PNG. Unknown types have no reference button or image, preserving IFF uncertainty. Viewing a reference leaves target locks unchanged.

The ship library also includes **SPF LOGISTICS TENDER**. Open **Bridge → Tactical / Security → Tactical → Armament catalog**, select **SPF LOGISTICS TENDER** under **Ship class specification**, then choose **View five-view reference**. The original PNG is available through **Full-size image**. Its confirmed equipment is two 30 mm CIWS, one 120 mm autocannon, 20 ventral MP missiles in vertical launch tubes, two main engines, and a rear-facing hangar for six repair shuttles with two launch lanes aft and two on each side. Repair-shuttle operations are reference data; the tender is available in the library rather than added to the twelve-contact training encounter or randomized traffic.

### Planetary chart references

Local Flight also shows the destination planet and its existing station moon (Moon, Phobos, Ganymede, Titan, Titania, or Triton). **Planetary overview** fits the bodies and ship together; **Center on ship** restores the 220 km local chart. Off-chart bodies have edge markers, and the controls list distances to their surfaces. Body sizes use rounded NASA/JPL radii; tiny bodies have a minimum visible marker. Moon separations and illustrative directions reuse the strategic settlement chart. Arrivals place the training-frame origin 100 km above the destination body's +X limb. These fixed chart references do not simulate gravity, orbital motion, terrain, or collisions; automatic guidance still avoids only the training debris field. Deep-space and mining sectors have no planetary references. Plot patrol waypoints at local ranges within the existing ±100,000 km coordinate limit.

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

Countermeasures, shuttle facilities, and engines appear in separate sections in the class catalog and identified ship details. Engine models and EPD ratings remain provisional. Dispenser quantities are not yet specified. Civilian and privateer fittings remain provisional and have no assigned weapon quantities. Unidentified contacts retain unknown armaments, countermeasures, shuttle facilities, and engines. Ammunition, firing, ranges, damage, repair and automatic CIWS are simulated. Chaff/flare deployment and shuttle launch/recovery are not yet simulated. Mounting locations do not yet restrict firing arcs. Existing saves migrate the earlier pirate fits without resetting player progress; see COMBAT.md for the migration rules.

The training encounter begins with twelve contacts, one for each underlying ship type: UNE cargo ship, light cargo ship, transport, and large transport; privateer; private yacht; pirate frigate and corvette; SDF frigate, destroyer, cruiser, and heavy cruiser. Set 200 km initially to see every contact; IFF determines which identities are revealed. Ship names, registries, size classes, and engine models are provisional fictional data. Armaments use the shared catalog; all four SDF and both pirate class fittings and engine counts are user-confirmed, while civilian and privateer fittings remain provisional. Weapons, damage, return fire, repairs, finite spares and station service are available. Autonomous hostile patrol AI, internal force fields and detailed crew/resource simulation remain future systems. Science reviews the existing navigation catalog rather than generating new discoveries. Communications reports are written to the shipboard log; no external messages are sent. Nominal engineering/support readouts describe the prototype's starting condition. Temperature is an editable setpoint; atmosphere at 101 kPa and artificial gravity at 1.0 g are provisional defaults, without a simulated crew-health model.

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

Provisional details for review: the Vanguard-class frigate, a heliopause station at a 120 AU patrol boundary, and a nominal cruise rate of 3.8 AU/day (approximately 31.6 days for a radial 120 AU crossing). This boundary represents the prototype patrol area, not a claim that the Solar System ends there.

The Sun stays at the origin. The overview uses a logarithmically compressed radial scale to keep all planets readable; its square grid is a display reference, not uniform AU cells. Navigation coordinates, travel distances, and ETAs use a separate AU coordinate space. Curved-looking map routes are straight legs in this physical coordinate space. Planet positions are illustrative, not an astronomical ephemeris for 2250, and remain fixed in this prototype. Strategic EPD acceleration, orbital interception, moving astronomical bodies, weapons combat, supplies, and crew simulation are reserved for future phases. Local sector maneuvers use the separate kilometer-scale Vector Drive model described above; their displacement is not drawn on the compressed heliocentric chart.

The application runs without third-party JavaScript dependencies or external assets. Optional Google Fonts enhance the typography when available; local system fonts provide fallbacks. No data is sent to a server or external game service.

## Ship names

Choose your frigate's name in **New Mission**, or change the current ship under **Bridge → Command → Ship name**. The selector offers names that follow the UNE military naming convention; SDF keeps its existing service prefix. The chosen name appears on the bridge, strategic and local charts, Tactical, new Comms messages and save headers, and persists in portable saves and browser autosaves. Historical Comms messages keep the name used when they were sent. The default frigate name is **SDF Andes**.

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
