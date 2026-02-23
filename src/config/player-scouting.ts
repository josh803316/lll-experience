export interface PlayerScouting {
  height?: string;
  weight?: string;
  strengths?: string;
  weakness?: string;
  projection?: string;
  comp?: string;
}

/** Scouting data for 2026 NFL Draft prospects. Keys are normalized lowercase player names. */
export const PLAYER_SCOUTING_2026: Record<string, PlayerScouting> = {

  // ── QBs ───────────────────────────────────────────────────────────────────
  "fernando mendoza": {
    height: "6-5", weight: "225 lbs",
    strengths: "Elite pre-snap processor with pinpoint ball placement and quick decisions; leads the nation in adjusted completion % and is the best back-shoulder thrower in the class.",
    weakness: "Completes only 53% of passes outside the pocket and has minimal experience under center (3% of snaps).",
    projection: "No. 1 overall / Top 5",
    comp: "Joe Burrow",
  },
  "ty simpson": {
    height: "6-2", weight: "215 lbs",
    strengths: "Highly accurate passer who fits throws into tight windows; quick pre- and post-snap processor who works through full progressions and reads the entire field.",
    weakness: "Interior pressure speeds up his process and exposes limited lateral escapability; deep ball beyond 30 yards lacks adequate touch.",
    projection: "Top 2 QB / Late Round 1",
    comp: "Baker Mayfield",
  },

  // ── RBs ───────────────────────────────────────────────────────────────────
  "jeremiyah love": {
    height: "6-0", weight: "214 lbs",
    strengths: "Complete bell-cow back with home-run speed (sub-4.4) plus advanced route-running and pass-catching to impact the offense in multiple ways.",
    weakness: "Pass protection is a development area; not a power runner and struggles picking up blitzers.",
    projection: "Top 10–15 / Round 1",
    comp: "Alvin Kamara",
  },
  "jadarian price": {
    height: "5-11", weight: "210 lbs",
    strengths: "Explosive instinctive runner with elite acceleration, top speed, and outstanding vision; runs low to the ground with excellent contact balance.",
    weakness: "Ball-security concerns (3 fumbles in 2025) and limited integration into the passing game as a receiver and pass protector.",
    projection: "Day 2 / Rounds 2–3",
    comp: "Raheem Mostert",
  },

  // ── WRs ───────────────────────────────────────────────────────────────────
  "jordyn tyson": {
    height: "6-2", weight: "200 lbs",
    strengths: "Smooth, fluid route runner who creates separation with clean breaks and no wasted motion; elite body control and hang time at the catch point.",
    weakness: "Has battled injuries in each of the last three seasons; needs to improve play strength and hand-fighting on releases.",
    projection: "Top 10–15 / Round 1",
    comp: "Michael Pittman Jr.",
  },
  "carnell tate": {
    height: "6-3", weight: "195 lbs",
    strengths: "Pro-ready route runner who consistently wins at the top of routes; strong hands and excellent ball skills, comfortable catching through contact and in traffic.",
    weakness: "Lacks elite top-end speed to beat corners vertically; lanky frame makes press releases difficult.",
    projection: "Top 10 / Early Round 1",
    comp: "Chris Olave",
  },
  "omar cooper jr.": {
    height: "6-0", weight: "200 lbs",
    strengths: "Compact slot receiver who excels on digs, crossers, and slants with good contact balance; quickness and agility reliably produce chunk yardage.",
    weakness: "Lacks vertical explosiveness to be a consistent deep threat outside the numbers; best suited to win from the slot.",
    projection: "Day 2 / Rounds 2–3",
    comp: "Amon-Ra St. Brown",
  },
  "makai lemon": {
    height: "5-11", weight: "195 lbs",
    strengths: "Biletnikoff Award winner with elite hands and tremendous catch focus; outstanding yards-after-catch ability and spatial awareness for a pound-for-pound toughest WR in the class.",
    weakness: "Size and length limitations can show up in contested situations against bigger boundary corners.",
    projection: "Top 15 / Round 1",
    comp: "Amon-Ra St. Brown",
  },
  "denzel boston": {
    height: "6-4", weight: "209 lbs",
    strengths: "Basketball-like catch-point ability using length and vertical explosion to high-point the football; strong, reliable hands with very few drops throughout his college career.",
    weakness: "Does not consistently create separation; lacks top-tier quickness and change-of-direction ability to regularly win off the line.",
    projection: "Day 2 / Rounds 2–3",
    comp: "Sidney Rice",
  },
  "zachariah branch": {
    height: "5-10", weight: "180 lbs",
    strengths: "Sub-4.35 track speed and elite burst as a slot/returner specialist; exploits mismatches with quick touches and soft hands, dangerous in open field.",
    weakness: "Lack of physicality is a consistent concern; minimal blocking presence and often a liability in that phase.",
    projection: "Late Round 1 / Early Round 2",
    comp: "Marquise Hollywood Brown",
  },
  "malachi fields": {
    height: "6-4", weight: "218 lbs",
    strengths: "Prototypical X-receiver who thrives in contested-catch situations with a wide catch radius, strong hands, and excellent body control in traffic.",
    weakness: "Struggles to create separation consistently; lacks creative releases against press coverage.",
    projection: "Day 2 / Early Round 2",
    comp: "George Pickens",
  },
  "germie bernard": {
    height: "6-1", weight: "204 lbs",
    strengths: "Smooth, physical receiver with exceptional hands (only 4 drops on 232 career targets) and elite yards-after-catch feel; reliable possession target in any scheme.",
    weakness: "Limited top-end speed shows up when trying to stack perimeter corners on vertical routes.",
    projection: "Day 2–3 / Rounds 3–4",
    comp: "Jakobi Meyers",
  },
  "brenen thompson": {
    height: "5-9", weight: "170 lbs",
    strengths: "One of the fastest receivers in the class — elite burst and top-end speed make him a true field-stretcher; good deep-ball tracker and quick out of breaks.",
    weakness: "Undersized frame raises durability concerns; wins less than a third of contested-catch opportunities.",
    projection: "Day 3 / Rounds 4–5",
    comp: "Marquise Hollywood Brown",
  },

  // ── TEs ───────────────────────────────────────────────────────────────────
  "michael trigg": {
    height: "6-4", weight: "240 lbs",
    strengths: "Among the most dangerous receiving TE prospects in the class — combination of size, acceleration, and large catch radius makes him a reliable target down the seam.",
    weakness: "Blocking is the biggest concern; struggles as an in-line blocker and technique needs significant refinement.",
    projection: "Day 2–3 / Round 3",
    comp: "Evan Engram",
  },
  "eli stowers": {
    height: "6-4", weight: "225 lbs",
    strengths: "John Mackey Award winner with prototypical receiving TE frame; fluid athleticism allows him to contribute as both a blocker and a dynamic pass-catcher down the seam.",
    weakness: "Transitioned from QB; blocking technique and physicality against NFL-caliber defenders is still unproven.",
    projection: "Day 3 / Rounds 4–6",
    comp: "Luke Schoonmaker",
  },

  // ── EDGE ──────────────────────────────────────────────────────────────────
  "rueben bain jr.": {
    height: "6-3", weight: "275 lbs",
    strengths: "Explosive first step and elite bend to turn the corner; possesses a full pass-rush arsenal (swim, bull rush, spin) with a relentless motor and rare disruptiveness at the point of attack.",
    weakness: "Hand timing is inconsistent after contact; arm length measured in the 0th percentile at 30¾ inches.",
    projection: "Top 5 pick / Round 1",
    comp: "Dwight Freeney",
  },
  "t.j. parker": {
    height: "6-4", weight: "263 lbs",
    strengths: "Excellent size and violent hand usage at the point of attack; elite ball-stripping ability with strong run-defense instincts and length to lock out blockers.",
    weakness: "Went 10 weeks without a sack in 2025; relies too heavily on power without a diverse rush plan and lacks the bend of a true first-round edge.",
    projection: "Mid Round 1 / Early Round 2",
    comp: "Nick Bosa (body type)",
  },
  "keldric faulk": {
    height: "6-6", weight: "285 lbs",
    strengths: "Rare size and length for an edge defender with elite power; leads FBS edge defenders with 62 run stops over three years and is a dominant run-game force.",
    weakness: "Pass-rush hand usage is underdeveloped; mediocre first step and below-average bend limit his ability to threaten the corner.",
    projection: "Late Round 1",
    comp: "Arik Armstead",
  },
  "akheem mesidor": {
    height: "6-3", weight: "280 lbs",
    strengths: "Rare explosiveness for his size with a quick first step; can win off speed or power with strong hands that set the edge in the run game.",
    weakness: "Age (turns 25 before draft) and off-field red flags are significant concerns; arm length below ideal.",
    projection: "Round 2",
    comp: "Brandon Graham",
  },
  "anthony lucas": {
    height: "6-5", weight: "267 lbs",
    strengths: "Long, athletic EDGE with natural pass-rush ability and high-motor effort; flashes an effective spin move and shows the athleticism to threaten the corner off the snap.",
    weakness: "Still developing a complete rush plan; production has been inconsistent relative to his physical tools.",
    projection: "Day 2–3",
    comp: "Myles Murphy",
  },
  "malachi lawrence": {
    height: "6-4", weight: "260 lbs",
    strengths: "Rare combination of size, length (35-inch arms), speed, and bend; multiple pass-rush moves and solid anchor in run defense — earned All-Big 12 First Team with 7 sacks in 2025.",
    weakness: "Production and consistency are boom-or-bust; projects best as a strongside EDGE in a two-gap front.",
    projection: "Day 2 / Rounds 2–4",
    comp: "Tyrion Davis-Price (size/athleticism archetype)",
  },
  "jaishawn barham": {
    height: "6-3", weight: "244 lbs",
    strengths: "Elite athletic profile with rare speed/bend off the edge; compact and physical enough to take on pullers, combining pass-rush upside with run-defense toughness.",
    weakness: "Coverage remains a significant developmental area; positional identity still being defined after transitioning from LB to edge.",
    projection: "Rounds 2–3",
    comp: "Versatile LB/EDGE hybrid (discount Abdul Carter)",
  },

  // ── DT ────────────────────────────────────────────────────────────────────
  "peter woods": {
    height: "6-3", weight: "310 lbs",
    strengths: "Exceptional get-off and power at the point of attack; rarely moved as a run defender with elite upper-body strength to stand up offensive linemen.",
    weakness: "Pad level off the snap is inconsistent; only five sacks in 35 career games raises questions about pass-rush ceiling.",
    projection: "Top 10 / Round 1",
    comp: "Jeffery Simmons",
  },
  "christen miller": {
    height: "6-4", weight: "310 lbs",
    strengths: "Rare combination of size, strength, and movement skills for a three-technique; stout run defender who reads gap concepts well and maintains discipline at the point of attack.",
    weakness: "Consistently late off the snap; lacks a reliable go-to pass-rush move and hands often allow linemen to get into his chest.",
    projection: "Round 2 (upside into late Round 1)",
    comp: "Milton Williams",
  },
  "caleb banks": {
    height: "6-6", weight: "330 lbs",
    strengths: "Exceptional length and surprising quickness off the snap for his size; generates penetration with a blend of size and effort, flashes a solid arm-over and spin move.",
    weakness: "Pad level is an ongoing concern; counters are underdeveloped and too many arm tackles at the point of attack.",
    projection: "Round 1",
    comp: "Stephon Tuitt",
  },

  // ── LB ────────────────────────────────────────────────────────────────────
  "arvell reese": {
    height: "6-4", weight: "242 lbs",
    strengths: "Most physically impressive and versatile LB in the class; a true hybrid who can set the edge, chase backside runs, or generate push on passing downs — voted top overall prospect by ESPN poll of NFL execs.",
    weakness: "Split snaps between D-line and LB, so refined off-ball positional technique is still developing compared to traditional prospects.",
    projection: "Top 5 pick / Round 1",
    comp: "Jamie Collins",
  },
  "sonny styles": {
    height: "6-4", weight: "235 lbs",
    strengths: "Outstanding athleticism and length with elite coverage fluidity; versatile enough to align inside, on the edge, or as an overhang defender with sideline-to-sideline range.",
    weakness: "Run-defense physicality and pop at the point of attack lags behind his coverage skill; needs to finish more consistently against the run.",
    projection: "Top 20 / Round 1",
    comp: "Rolando McClain",
  },
  "c.j. allen": {
    height: "6-1", weight: "235 lbs",
    strengths: "Exceptionally instinctive and intelligent LB with elite reaction time, tackling reliability, and sideline-to-sideline range; hits like a ton of bricks without losing balance — every-down player.",
    weakness: "Lacks size and explosive splash plays (limited career sacks/INTs); can be exploitable in man coverage against bigger blockers.",
    projection: "Late Round 1",
    comp: "Roquan Smith",
  },
  "anthony hill jr.": {
    height: "6-3", weight: "238 lbs",
    strengths: "Rare burst and sideline-to-sideline acceleration; dominant run defender who posted 113 tackles, 16.5 TFLs, and 8 sacks in 2024 with safety-level speed and linebacker power.",
    weakness: "Coverage instincts are still developing, especially against smaller route-running backs in man coverage.",
    projection: "Day 2 / Round 2 (upside into late Round 1)",
    comp: "Bobby Wagner / Devin White",
  },
  "josiah trotter": {
    height: "6-2", weight: "237 lbs",
    strengths: "Feared downhill run defender with outstanding diagnostic instincts; strong with a lot of knockback power, quick to key and beat blockers to their spots.",
    weakness: "Hip stiffness and poor change-of-direction limit man-coverage ability on backs; zone awareness is a consistent weakness.",
    projection: "Day 2–3 / Rounds 3–4",
    comp: "Jordyn Brooks",
  },

  // ── OT ────────────────────────────────────────────────────────────────────
  "kadyn proctor": {
    height: "6-7", weight: "366 lbs",
    strengths: "Mountain of a man with elite-level power and physicality; dominant run blocker who can bulldoze rushing lanes with rare athleticism for his size (32-inch vertical).",
    weakness: "Unrefined technique leads to too many clean losses in pass protection; his mass makes lateral redirection against counter moves exploitable.",
    projection: "Mid Round 1 / Early Round 2",
    comp: "JC Latham",
  },
  "spencer fano": {
    height: "6-6", weight: "308 lbs",
    strengths: "One of the most athletically polished tackles in the class with elite footwork, fluid hips, and advanced hand placement — allowed zero sacks and only 5 pressures in 2025.",
    weakness: "Lean build raises questions about his ability to consistently anchor against NFL bull-rushers.",
    projection: "Late Round 1 / Early Round 2",
    comp: "Bernhard Raimann",
  },
  "caleb lomu": {
    height: "6-6", weight: "308 lbs",
    strengths: "Elite hand placement to consistently counter pass-rush moves; gave up zero sacks on 382 pass-blocking snaps in 2025 (82.1 PFF grade) with great athleticism to reach the second level.",
    weakness: "Frame is on the lighter end for an NFL tackle; needs to improve finishing as a run blocker.",
    projection: "Round 1 (top 30 picks)",
    comp: "Darnell Wright",
  },
  "monroe freeling": {
    height: "6-7", weight: "315 lbs",
    strengths: "Exceptional physical profile with elite length (84-inch wingspan) and quick feet to mirror speed rushers; allowed just 2 sacks on 747 snaps in 2025 despite battling an ankle injury.",
    weakness: "Run blocking is a work in progress; upright playing style and tendency to lunge leave him vulnerable in gap and zone run schemes.",
    projection: "Round 1",
    comp: "Olu Fashanu",
  },
  "francis mauigoa": {
    height: "6-6", weight: "335 lbs",
    strengths: "Big, thick experienced tackle with elite anchor strength and disciplined technique; consensus All-American and multi-year All-ACC starter who can match speed rushers step-for-step.",
    weakness: "Short arm length raises concerns against NFL edge rushers, making a tackle-to-guard conversion likely.",
    projection: "Round 1 (top 10–20)",
    comp: "Taliese Fuaga",
  },
  "blake miller": {
    height: "6-6", weight: "315 lbs",
    strengths: "Durable, experienced right tackle (54 career starts) with good athletic ability, quick proactive hands, and solid knee-bend to hold his ground against speed rushers.",
    weakness: "Highly inconsistent tape with too many clean losses; lacks high-end upper-body strength to anchor against powerful NFL edge rushers.",
    projection: "Day 2 / Rounds 2–3",
    comp: "Luke Goedeke",
  },
  "chase bisontis": {
    height: "6-5", weight: "315 lbs",
    strengths: "Light-footed interior guard with excellent initial quickness, low pad level, and impressive recovery ability; fits well in zone-blocking schemes and is a top-ranked guard in the class.",
    weakness: "Needs to add functional strength; not a dominant movement blocker and can be overwhelmed by powerful NFL interior defenders.",
    projection: "Early–Mid Round 2 (first-round grade on some boards)",
    comp: "David DeCastro / Wyatt Teller",
  },
  "connor lew": {
    height: "6-3", weight: "302 lbs",
    strengths: "Elite pass-protection technician with exceptional movement skills, superior hand placement, and high football IQ for identifying blitzes and adjusting protections — top-ranked center in the class.",
    weakness: "Tore his ACL in October 2025 and will be recovering; lacks ideal mass to consistently displace powerful NFL nose tackles.",
    projection: "Late Round 2 / Early Round 3 (pre-injury: Round 1)",
    comp: "Frank Ragnow",
  },
  "emmanuel pregnon": {
    height: "6-5", weight: "318 lbs",
    strengths: "Stoutly-built interior guard with a nasty demeanor, elite physicality, powerful grip, and lateral quickness to mirror and anchor; posted an 86.7 PFF grade and First-Team All-American honors in 2025.",
    weakness: "Older prospect (6 college seasons) and lateral redirection can be choppy; no positional versatility to play center or tackle.",
    projection: "Round 1 (pick ~30) / Early Round 2",
    comp: "Steve Avila",
  },

  // ── CB ────────────────────────────────────────────────────────────────────
  "avieon terrell": {
    height: "5-11", weight: "180 lbs",
    strengths: "Exceptional zone-coverage instincts and true inside-outside versatility; elite closing speed and smooth footwork allow him to excel on the boundary and as a slot corner.",
    weakness: "Well below-average size and short arms limit his ability to match up physically with bigger receivers at the catch point.",
    projection: "Mid–Late Round 1",
    comp: "Sauce Gardner (scheme versatility)",
  },
  "mansoor delane": {
    height: "6-0", weight: "190 lbs",
    strengths: "Versatile, technically refined press-man corner with sticky coverage and elite instincts; posted zero TDs allowed and zero penalties in 2025 at LSU.",
    weakness: "Questions about top-end speed; inconsistent punch timing in press coverage against elite receivers.",
    projection: "Top 10–15 (possibly first CB off the board)",
    comp: "Quinyon Mitchell / Darius Slay",
  },
  "keionte scott": {
    height: "6-0", weight: "192 lbs",
    strengths: "Explosive and physical slot/hybrid defender with outstanding blitz instincts, run-stopping ability, and big-play production — posted 5 sacks and 2 INTs in 2025.",
    weakness: "Best as a slot/nickel specialist rather than an outside corner; limited against bigger boundary receivers.",
    projection: "Mid Round 2 / Top of Round 3",
    comp: "Jaylon Jones",
  },
  "d'angelo ponds": {
    height: "5-9", weight: "170 lbs",
    strengths: "Feisty, twitchy slot corner with elite footwork, timing, and closing speed; logged 20 passes defensed and 5 INTs in two seasons showing no fear against bigger receivers.",
    weakness: "Undersized with short arms; limited ability to contest jump balls and play the ball against taller outside receivers.",
    projection: "Mid Round 2 / Day 2",
    comp: "DJ Reed",
  },

  // ── S ─────────────────────────────────────────────────────────────────────
  "caleb downs": {
    height: "6-0", weight: "205 lbs",
    strengths: "Elite football IQ safety who reads QB eyes expertly and rallies to the ball with explosive downhill burst; rare positional versatility to play slot, LB, or either safety spot.",
    weakness: "Not the most fluid athlete in space; may struggle mirroring shifty slot receivers and lacks the frame to dominate tight ends consistently.",
    projection: "Top 5–10 (considered best player in class by some evaluators)",
    comp: "Eric Berry / Budda Baker",
  },
  "dillon thieneman": {
    height: "6-0", weight: "205 lbs",
    strengths: "High-IQ coverage safety with excellent anticipation, fluid hips, and versatility to play FS, SS, or in the slot; 8 career interceptions with great ball skills.",
    weakness: "Not an overpowering physical tackler; average change-of-direction and acceleration limit his impact as a downhill force.",
    projection: "Late Round 1 / Early Round 2",
    comp: "Justin Reid",
  },
  "a.j. haulcy": {
    height: "6-0", weight: "222 lbs",
    strengths: "Physically dominant box safety with elite zone instincts, quick-trigger ball skills, and violent downhill tackling ability — best zone safety in the 2026 class per multiple evaluators.",
    weakness: "Stocky frame and below-average top speed limit his range as a single-high deep safety; inconsistent wrap-up technique.",
    projection: "Day 2 / Rounds 2–3",
    comp: "Andre Cisco / Jabrill Peppers",
  },
  "genesis smith": {
    height: "6-2", weight: "205 lbs",
    strengths: "Rangy, instinctive safety with the length to make plays in the passing game and enough athleticism to rotate as a single-high or split-field defender.",
    weakness: "Still refining his downhill game and tackling technique; needs reps to develop his coverage technique against NFL-level route runners.",
    projection: "Day 2–3",
    comp: "Damar Hamlin",
  },
};
