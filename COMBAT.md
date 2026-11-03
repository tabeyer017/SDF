# Combat and damage control

The damage model and performance values below are a first playable balance pass. SDF and pirate weapon quantities and mounting arrangements use the confirmed class fits. Civilian fits remain provisional (one mount per listed weapon without a confirmed fit). Each missile type has one provisional firing channel per ship; missile inventory is not a launcher count.

The pirate corvette has one forward 120 mm autocannon turret and 30 ventral-launched GP missiles. The pirate frigate has two single-gun 120 mm turrets (one forward, one aft atop the shuttle hangar) and 40 ventral-launched GP missiles. Both have two 30 mm CIWS mounts (one port, one starboard), chaff, flares, a radar jammer, one bay with four assault shuttles, 40 raiders, and two engines. Chaff/flare deployment and shuttle operations remain future simulation work; mounting locations are catalog information rather than simulated firing arcs.

Earlier saves with provisional pirate fits upgrade on load. Existing hull/system damage, expended ammunition, reload timers, repair jobs, surrender state, and player progress are retained. Added mounts inherit their former weapon group's damage and reload time; inventory capacity increases retain the number of rounds already expended. Corvette MP/75 mm mounts become GP/120 mm mounts, while projectiles already in flight keep their original weapon, damage and guidance.

## Confirmed targeting and projectile rules

- Guns use ship radar, laser range finding, and laser targeting.
- Missiles guide with onboard radar and IR. Previously launched missiles do not depend on the firing ship's radar remaining active.
- Every 30 mm CIWS mount has an independent targeting computer, tracking radar, and tracking IR. Its tracking continues if the ship's main radar or fire-control sensors are disabled, provided that mount and main power still work.
- Choose missile targets directly with **Aim at system**. There is no separate missile-role preset.
- MP missiles make precision subsystem strikes: engines, weapon mounts, radar / fire control, radar jammer, reactor, power, EPD, bridge, communications, or life support. They cannot select a whole-ship hull strike or intercept incoming missiles. Subsystem hits still inflict collateral hull damage under the shared damage model.
- GP missiles can attack hulls, any subsystem, or incoming missiles. AA use against shuttles and fighters remains part of the setting; those entities are not yet spawned.
- AS missiles carry the heavy anti-ship warhead and can strike the hull or any ship subsystem. Internal systems remain protected until the hull reaches zero; AS missiles cannot intercept incoming missiles. Their current damage remains 160, compared with GP 90 and MP 60.
- Radar and jammer aim choices automatically select anti-radiation and anti-jammer guidance. Other subsystem choices use onboard radar / IR precision guidance. Guidance and the target system are fixed when launched.
- Ballistic rounds inherit the firing ship's velocity and retain their resulting velocity in the sector frame. Damage does not fall with distance. Guided missiles maintain their configured speed while steering toward the target.
- Setting note only: weapons that miss eventually self-destruct, including after an appropriate travel distance. Self-destruction distance, timers, debris, and stray missed projectiles are not simulated. A miss is resolved and discarded.

## Initial weapon performance

Rates are per barrel or missile firing channel. Range is the maximum launch/fire-control range, not damage falloff. Travel is simulated in kilometres and simulated seconds. These speed values are game assumptions, not real weapon specifications.

| Weapon | Maximum range | Rounds/minute | Damage/round | Launch speed (km/s) |
| --- | ---: | ---: | ---: | ---: |
| 120 mm autocannon | 30 km | 20 | 12 | 1 |
| 75 mm autocannon | 20 km | 40 | 5 | 1 |
| 30 mm CIWS | 20 km | 3,000 | 0.1 | 1 |
| Rail gun | 150 km | 6 | 180 | 10 |
| AS missile | 200 km | 4 | 160 | 1 |
| MP missile | 80 km | 7.5 | 60 | 1 |
| GP missile | 120 km | 6 | 90 | 1 |

Turrets discharge all their barrels together and consume ammunition per barrel. CIWS uses ten-round bursts. Automatic CIWS defaults on and engages incoming missiles within 20 km. Each mount independently reserves one missile, consumes 75 rounds, and takes 10–15 simulated seconds per attempt, with an 85% interception chance at full condition. Separate mounts choose separate threats. Close launches, exhausted ammunition, damaged mounts, failed attempts, and large salvos can allow missiles through. Active cycles persist in saves. It does not intercept cannon shells or rail-gun rounds. With a GP mount, choose **Incoming missile · AA** under **Aim at system**, then choose the incoming missile from the AA target selector.

Hit probability depends on range, fire-control condition, and radar jamming; impact damage depends on armor and penetration, not distance. Anti-radiation and anti-jammer shots require their respective emitter and lose the lock if that emitter stops. Main radar can be silenced; passive coverage then has a provisional 60 km baseline, compared with 200 km active radar. Sensor damage reduces coverage. Radar jammers are confirmed on both pirate classes; jammer hardware on other classes remains provisional. Pirate contacts start with their jammers emitting.

In Tactical, check one or more weapon mounts. Expand **Targeting** for a selected mount to choose its own locked contact and aim system. The default **Active radar target** follows the current radar selection for new commands; add multiple locks with Ctrl + click to assign different contacts to different weapons. MP and AS targeting restrictions still apply per mount.

Right-clicking a radar contact opens compact fire control: mount checkboxes, an aim dropdown per mount, and individual **Fire/Burst** and **Start Firing** buttons for each mount. Each individual button checks that mount and issues an order only for it; the group buttons still operate on all checked mounts. These controls edit the same mount selections and aim values as the right-hand column, which also provides individual mount buttons. The clicked contact becomes the selected aim target for new commands without releasing other locks or changing active orders. **×**, an outside click, or **Escape** dismisses the popup. It also closes when leaving Tactical, losing the contact's live track, loading/resetting a game, or resizing the viewport.

Internal aim points (reactor, power distribution, EPD, bridge, communications, and life support) are greyed out and unselectable while the target has any hull points. Engines, weapon mounts, radar, and jammer are exposed equipment and can be targeted before the hull is breached. At exactly zero hull, surviving internal systems become selectable. Zero-point entries are red, marked **0 · DESTROYED**, and cannot be selected. An engine or weapon category reaches zero only when every component in that category is destroyed.

When the chosen aim point becomes unavailable, the dropdown advances to the next surviving, exposed entry in list order, wrapping as needed. Active continuous-fire orders advance by the same rule before the next launch. This never changes the target ship or redirects a shot already in flight. AS missiles follow the same rule and continue against surviving systems after hull destruction; automatic aim never switches a ship strike into an incoming-missile engagement.

**Fire once / burst** fires each ready selected mount once (a ten-round burst for CIWS). Unavailable mounts are skipped with an individual reason. **Start firing** starts or updates an independent order for each valid selected mount, including mounts that are reloading. Each mount repeats at its own rate, consumes its own weapon inventory, and retains the target and aim captured when ordered; changing the radar selection does not redirect an existing order. Unchecking a mount in either control panel stops its continuous-fire order; checking it again only selects it until a firing command is issued. A failed or destroyed mount stops only its own order. **Cease all fire**, available in the main column and popup, clears every player firing order and unchecks all mounts in both panels. **Clear selection** does the same. Firing starts the shared local simulation.

Armed ships attacked by the player return fire with available weapons; there is no autonomous patrol/hostile AI outside that engagement. Cease fire does not stop hostile retaliation or weapons already in flight. Pause local time to pause the whole encounter. All twelve contacts remain training traffic, not persistent world NPCs.

## Damage points and consequences

| Class | Hull | Spares | Teams | Armor reduction |
| --- | ---: | ---: | ---: | ---: |
| Private yacht | 350 | 40 | 1 | 5% |
| UNE light cargo | 500 | 60 | 1 | 8% |
| UNE cargo | 1,200 | 160 | 2 | 10% |
| UNE transport | 900 | 120 | 2 | 10% |
| UNE large transport | 1,800 | 250 | 3 | 15% |
| Privateer | 850 | 120 | 2 | 20% |
| Pirate corvette | 550 | 60 | 1 | 18% |
| Pirate frigate | 900 | 100 | 2 | 25% |
| SDF frigate | 1,000 | 200 | 2 | 30% |
| SDF destroyer | 1,500 | 300 | 3 | 35% |
| SDF cruiser | 2,400 | 500 | 4 | 40% |
| SDF heavy cruiser | 3,600 | 750 | 5 | 45% |

The frigate baseline is bridge 100, reactor 200, power distribution 150, EPD 160, sensors 80, communications 60, life support 140, radar jammer 60, and each engine 120 points. Other classes scale those points by hull/1,000, with a 20-point minimum. Every main engine has its own damage state; engine counts follow the existing catalog.

Every mount has its own points: autocannon turret 80, CIWS mount 50, rail-gun turret 160, missile firing installation 100. A disabled twin-gun turret disables both barrels. Hull points and equipment points are separate indicators. A hit on an available aim point reduces hull integrity by its post-armor damage and the selected equipment by 30% of that damage. Internal systems cannot be damaged through an intact hull. After the hull is breached, equipment damage continues with hull integrity held at zero. Aim categories engines/weapons select the first functioning component in that category. Damage location is abstracted by aim system; physical section geometry and directional armor are not simulated.

Condition bands are above 70% operational, 40–70% degraded (70% performance), below 40% critical (35% performance), and zero offline. Engine condition, reactor and power distribution affect thrust; existing velocity is preserved when thrust is lost. Turret damage increases reload time. Sensor damage reduces acquisition range and turret accuracy. Main power loss disables weapons. An offline EPD prevents strategic engagement. The bridge is tracked but does not yet enforce a separate command-delay penalty; communications damage does not yet block station-service requests. A reactor reaching zero shuts down rather than automatically exploding.

Hull below 50% causes pressure loss. Critical reactor/power hits can cause a fire. Fire consumes hull integrity; pressure loss, offline life support, or power loss consume a 1,800-second emergency air reserve. Exhausted air reduces hull to zero. At zero hull the ship is disabled, with no operational power, thrust, sensors, or weapons, but its surviving systems remain targetable. A player ship at zero hull cannot continue operating. Individual crew casualties and compartment propagation are not implemented.

## Repair and replenishment

Engineering owns the damage-control screen, repair queue, and docking/service controls. Operations reports spare-parts inventory and teams. Security and Environment can isolate fires and pressure loss. Command and Operations link to Engineering.

Engineering defaults to **Automatic repairs: ON**, including saves created before this setting existed. Repairable damage automatically joins the onboard queue; hull, life support, reactor, power, and engines take priority when new automatic jobs are assigned. Manual orders go ahead of automatic jobs. **Automatic repairs: OFF** stops automatic jobs and preserves manual orders and station service. Canceling an onboard job holds that system out of automatic scheduling; **Repair manually · held** clears its hold and queues a manual order. Re-enabling automatic repairs clears individual holds. The mode, holds, automatic jobs, and partial repair labor persist in JSON saves and browser autosaves. Automatic repairs respect pause, spare-parts limits, field ceilings, and destroyed-system restrictions; they never request docking or station service on your behalf.

Each repair team restores 10 points per simulated minute, or 5 points/minute for 30 seconds after a hit. The queue assigns one job to each available team. Each completed repair block of up to 5 points consumes one whole spare-parts unit; labor toward the next block is retained in saves. Canceling discards unfinished labor but never refunds consumed supplies. No points can be restored onboard once parts run out.

Field repairs stop at 60% hull integrity and 75% equipment integrity. A system at zero requires station replacement. Emergency isolation consumes no spare parts and restores no damage points. Repair jobs and emergencies continue during EPD transit as shipboard time advances; players should contain emergencies before departure.

Dock within 5 km of the current station's arrival point at 10 KPH or less, with no incoming missiles or live engaged opponents within 200 km. Docking cancels movement orders and holds the ship at rest. Undock before local maneuvering or EPD. Station service must be explicitly requested; station arrival alone does not replenish the ship.

The six lunar stations, Heliopause station, and Mars colony provide full service: 50 points/minute/team, replacement of destroyed systems, and repair to 100%, followed by 60 seconds for full spare-parts/ammunition replenishment. Station resources pay for these repairs; the player's empty inventory does not prevent service. Service also contains emergencies. Mining stations provide field-level repairs, replenish spares up to at least half capacity, and reload guns; they do not replace destroyed systems or reload missiles. There is no credit economy or station-stock depletion yet.

## Persistence

Version 2 JSON saves and browser autosaves include all player and encounter damage, ammunition, per-mount cooldowns, radar/jammer/CIWS settings, queued repairs and partial labor, emergencies, pending successful shots with their launch guidance, independent per-mount firing assignments, engagement orders, and station-service progress. Older single firing orders migrate to the list of mount orders. Active firing assignments reopen checked with their saved target and aim; unissued checkbox and targeting edits are session controls. Legacy missile-role fields and in-flight MP AA shots remain readable, but old presets do not control new launches. Loading pauses local and strategic time; it does not reroll shots already in flight. Version 1 saves migrate automatically with undamaged ships and full stores.

New sector arrivals replace training contacts and clear encounter fire orders/projectiles while retaining the player's damage, ammunition, spares, presets and onboard repair jobs. EPD departure discards weapons left behind in the previous encounter; it does not repair or resupply the player. Restart patrol creates a fresh player ship.
