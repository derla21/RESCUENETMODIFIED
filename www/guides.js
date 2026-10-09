/* ============================================================
   RescueNet Resident App — Interactive Emergency Guides
   Loaded from dashboard.html. Fully offline. Zero dependencies.
   ============================================================ */
(function () {
    'use strict';

    // ------------------------------------------------------------
    // Inline SVG icons (24x24, stroke-based, match app aesthetic)
    // ------------------------------------------------------------
    const I = {
        wind:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7a3 3 0 1 0 3-3"/></svg>',
        quake:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>',
        flood:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M7 10l5-6 5 6"/></svg>',
        fire:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-4 3-4 8a7 7 0 0 0 14 0c0-6-7-13-7-13z"/></svg>',
        volcano:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18l-6-11-3 3-3-5z"/><path d="M12 4v3M9 5l1 2M15 5l-1 2"/></svg>',
        landslide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 12 4l9 16z"/><path d="M8 14h8M6 18h12"/></svg>',
        tsunami:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18c3 0 3-4 6-4s3 4 6 4 3-4 6-4 2 4 2 4"/><path d="M6 12c3-4 6-4 9 0"/><path d="M12 4v4"/></svg>',
        bolt:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
        home:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 3l9 7v11H3z"/><path d="M9 21v-6h6v6"/></svg>',
        school:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 8l10 5 10-5z"/><path d="M6 12v5c0 2 3 4 6 4s6-2 6-4v-5"/></svg>',
        users:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        route:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 0 0 3-3V8"/></svg>',
        phone:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>',
        heart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
        kit:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="14" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2M12 12v6M9 15h6"/></svg>',
        check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
        warn:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
        shield:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z"/></svg>',
        chev:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    };
    const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';

    // ------------------------------------------------------------
    // Storage helpers
    // ------------------------------------------------------------
    function loadObj(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
    function saveObj(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    // ------------------------------------------------------------
    // Content — real, substantive, curated for Philippine context
    // ------------------------------------------------------------
    const DATA = {
        disaster: {
            kicker: 'Know the hazards',
            title: 'Disaster Information',
            desc: 'The most common hazards in the Philippines — their warning signs and the specific actions that save lives.',
            type: 'accordion',
            items: [
                {
                    icon: 'wind', name: 'Typhoon (Bagyo)', sub: 'Signal #1 – #4 · storm surge · 3-hourly updates',
                    sections: [
                        { h: 'Warning signs', kind: 'list', items: [
                            'Sudden drop in pressure; sea level recedes sharply',
                            'Big, dark, low clouds moving steadily in one direction',
                            'Rain blowing horizontally; wind shifts direction abruptly',
                            'PAGASA raises Wind Signal #1 (30–60 kph)'
                        ]},
                        { h: 'Before landfall', kind: 'steps', items: [
                            'Charge phones and power banks; fill every water container',
                            'Trim trees, secure roof sheets, tape windows in an X',
                            'Know your nearest evacuation center and the route to it',
                            'Photograph documents and store in a waterproof bag'
                        ]},
                        { h: 'During', kind: 'steps', items: [
                            'Stay inside, away from windows. Move to the lowest safe room',
                            'If the roof tears off, shield head and neck with a mattress',
                            'Do not go out during the eye — the storm resumes within minutes',
                            'Monitor battery radio for PAGASA updates'
                        ]},
                        { h: 'After', kind: 'list', items: [
                            'Watch for downed live wires, flooded drains, weakened trees',
                            'Boil drinking water until authorities declare it safe',
                            'Photograph damage before cleanup for insurance and LGU aid'
                        ]}
                    ],
                    callout: { kind: 'warn', text: '<b>Signal #4 (220+ kph)</b> means total evacuation of coastal and low-lying areas is mandatory. Do not wait for the flood.' }
                },
                {
                    icon: 'quake', name: 'Earthquake', sub: 'West Valley Fault · Philippine Fault Zone',
                    sections: [
                        { h: 'Warning signs', kind: 'list', items: [
                            'Distant rumbling; animals behaving strangely',
                            'Objects swinging before you feel the shaking',
                            'PHIVOLCS PRELIMS / earthquake bulletins'
                        ]},
                        { h: 'DROP – COVER – HOLD ON', kind: 'steps', items: [
                            '<b>DROP</b> on hands and knees before shaking throws you',
                            '<b>COVER</b> under a sturdy desk; protect head and neck',
                            '<b>HOLD ON</b> to your shelter until shaking stops',
                            'If no shelter, crawl to an interior corner — <b>never run outside</b> during shaking'
                        ]},
                        { h: 'After', kind: 'list', items: [
                            'Expect aftershocks for hours to weeks — do not re-enter damaged buildings',
                            'Check gas, water, electric. If you smell gas, open windows and leave',
                            'Move to high ground if near the coast — tsunami may follow'
                        ]}
                    ],
                    callout: { kind: 'err', text: '<b>Never use elevators, never light matches, never stand under a balcony.</b> Three top causes of quake deaths.' }
                },
                {
                    icon: 'flood', name: 'Flood (Baha)', sub: 'Flash flood · urban flooding · lahar',
                    sections: [
                        { h: 'Warning signs', kind: 'list', items: [
                            'Rivers rising fast after sustained rain upstream',
                            'Muddy water entering streets; drains reversing',
                            'Barangay alarm or megaphone warning'
                        ]},
                        { h: 'Do', kind: 'steps', items: [
                            'Move to a higher floor immediately — do not wait for water at the door',
                            'Turn off the main breaker if it is safe to reach',
                            'Grab your go-bag (IDs, meds, water) and evacuate on foot',
                            'If trapped on roof, wave a bright cloth or shine a torch at night'
                        ]},
                        { h: 'Never', kind: 'list', items: [
                            'Walk through moving water above the knee — 15 cm can knock you down',
                            'Drive through flooded roads — 30 cm floats most cars',
                            'Return home until officials declare water safe (leptospirosis risk)'
                        ]}
                    ],
                    callout: { kind: 'info', text: 'Do not cross a flooded river on a rope or bamboo bridge. This is the #1 cause of avoidable typhoon deaths in the Philippines.' }
                },
                {
                    icon: 'fire', name: 'Structural Fire (Sunog)', sub: 'House fire · electrical · LPG',
                    sections: [
                        { h: 'Prevention', kind: 'list', items: [
                            'One high-wattage appliance per outlet (AC, ref, microwave)',
                            'Replace any cord that is warm, brittle, or has exposed copper',
                            'Test smoke alarm monthly; keep an extinguisher or bucket of sand',
                            'Sleep with the bedroom door closed — it slows fire and smoke by 30 min'
                        ]},
                        { h: 'Escape plan', kind: 'steps', items: [
                            'Feel the door with the back of your hand before opening — hot means fire on the other side',
                            'Crawl low under smoke; air is cleanest 30 cm above the floor',
                            'Use the two exits you pre-planned. Never re-enter for belongings',
                            'If clothes catch fire: <b>STOP, DROP, ROLL</b>'
                        ]},
                        { h: 'If trapped', kind: 'list', items: [
                            'Close doors, seal cracks with a wet cloth',
                            'Open a window, wave a bright cloth or shout at regular intervals',
                            'Call 911 or BFP with your exact address'
                        ]}
                    ]
                },
                {
                    icon: 'volcano', name: 'Volcanic Eruption', sub: 'Mayon · Taal · Pinatubo · Kanlaon',
                    sections: [
                        { h: 'Alert levels (PHIVOLCS)', kind: 'list', items: [
                            '<b>ALERT 1</b> – Rising magma, increase in earthquakes',
                            '<b>ALERT 2</b> – Frequent quakes, ash emission, imminent eruption',
                            '<b>ALERT 3</b> – Eruption in progress, mandatory evacuation of danger zones',
                            '<b>ALERT 4</b> – Destructive eruption ongoing'
                        ]},
                        { h: 'Ash protection', kind: 'steps', items: [
                            'Wet cloth or N95 mask over nose and mouth',
                            'Long sleeves, goggles, hat — ash irritates skin and eyes',
                            'Do NOT drive in heavy ash — engines stall',
                            'Sweep ash off the roof daily and wet it down; 15 cm of ash collapses corrugated roofs'
                        ]},
                        { h: 'Lahar (volcanic mudflow)', kind: 'list', items: [
                            'Rivers of mud triggered by rain falling on ash deposits',
                            'Move perpendicular to the flow, to high ground — never downstream'
                        ]}
                    ]
                },
                {
                    icon: 'landslide', name: 'Landslide', sub: 'Steep slopes · quarry cuts · deforested hills',
                    sections: [
                        { h: 'Warning signs', kind: 'list', items: [
                            'New cracks in the ground or hillside',
                            'Doors or windows suddenly jam',
                            'Trees or telephone poles leaning',
                            'Unusual rumbling or roaring from the slope'
                        ]},
                        { h: 'If you feel it', kind: 'steps', items: [
                            'Run <b>sideways</b> away from the slide path — never downhill with it',
                            'If trapped, curl into a ball and cover your head',
                            'Do NOT return for family members until rescuers arrive'
                        ]}
                    ],
                    callout: { kind: 'warn', text: 'Homes built on fill dirt or old quarry cuts are the highest-risk structures after typhoons.' }
                },
                {
                    icon: 'tsunami', name: 'Tsunami', sub: 'Ocean retreat · quakes above 7.0 near coast',
                    sections: [
                        { h: 'Natural warning signs', kind: 'list', items: [
                            'Ocean suddenly pulls back, exposing the seabed',
                            'Strong long earthquake (60+ seconds) near the coast',
                            'Unusual roaring from the sea'
                        ]},
                        { h: 'Action', kind: 'steps', items: [
                            'Do not wait for an official warning — evacuate immediately',
                            'Move to higher ground (15 m+ elevation) or 1 km inland',
                            'If caught, climb a sturdy concrete structure roof — do not swim',
                            'Stay high for 2+ hours; the first wave is rarely the largest'
                        ]}
                    ]
                },
                {
                    icon: 'bolt', name: 'Lightning & Thunderstorm', sub: 'Most common weather killer in PH',
                    sections: [
                        { h: 'The 30/30 rule', kind: 'list', items: [
                            'If flash-to-bang is under 30 seconds, you are in danger',
                            'Wait 30 minutes after the last thunder before going back out'
                        ]},
                        { h: 'Safe / unsafe', kind: 'list', items: [
                            'SAFE: enclosed building with wiring/plumbing, hard-top vehicle',
                            'UNSAFE: isolated tree, open field, water, metal fence, beach umbrella',
                            'If caught outside: feet together, crouch low, hands over ears — <b>never lie flat</b>'
                        ]}
                    ]
                }
            ]
        },

        safety: {
            kicker: 'Everyday prevention',
            title: 'Safety Reminders',
            desc: 'Small habits that prevent most household and community emergencies.',
            type: 'tabs',
            tabs: [
                { name: 'Home', icon: 'home', sections: [
                    { h: 'Electrical', kind: 'list', items: [
                        'One high-wattage appliance per outlet (AC, ref, microwave)',
                        'Replace any cord that is warm, brittle, or has exposed copper',
                        'Install a dedicated breaker for the kitchen and washing area',
                        'Never run cords under rugs or across doorways'
                    ]},
                    { h: 'Gas & cooking', kind: 'list', items: [
                        'Check LPG hose with soap-water weekly — bubbles mean a leak',
                        'Never leave cooking unattended; keep curtains away from the stove',
                        'Store the LPG tank outside, valve up, chained',
                        'Fire triangle: heat + fuel + oxygen. Kill one to stop a fire'
                    ]},
                    { h: 'Children & elderly', kind: 'list', items: [
                        'Lock away meds, cleaners, knives, and small magnets',
                        'Empty buckets after mopping — infants drown in 2 cm of water',
                        'Night-light in the bathroom and hallway to prevent falls'
                    ]}
                ], callout: { kind: 'warn', text: '<b>7 out of 10 house fires start in the kitchen.</b> Never cook while sleepy or intoxicated.' }},
                { name: 'School', icon: 'school', sections: [
                    { h: 'For students', kind: 'list', items: [
                        'Know two exits and your class\'s evacuation assembly point',
                        'Never run in hallways during drills — trampling kills more than the hazard',
                        'Report broken handrails, exposed wires, or leaking roofs to a teacher',
                        'Keep your phone charged and ICE contact on the lock-screen'
                    ]},
                    { h: 'For parents', kind: 'list', items: [
                        'Update the school emergency contact every semester',
                        'Agree on a reunion point if pickup is impossible during a disaster',
                        'Pack a small go-bag in the school bag: water, biscuit, whistle, wet wipes'
                    ]},
                    { h: 'Bullying & online', kind: 'list', items: [
                        'Screenshot threats; report to adviser and parents; do not reply',
                        'Never share location, school uniform photo, or home address publicly'
                    ]}
                ]},
                { name: 'Community', icon: 'users', sections: [
                    { h: 'Know your block', kind: 'list', items: [
                        'Learn the location of the nearest AED, fire extinguisher, hydrant',
                        'Identify neighbors who are elderly, PWD, infant, or on oxygen',
                        'Join or form a Barangay Disaster Risk Reduction Committee (BDRRMC)'
                    ]},
                    { h: 'Report hazards', kind: 'list', items: [
                        'Clogged canal → barangay captain + 911 non-emergency',
                        'Illegal dumping → DENR hotline (02) 8256-9881',
                        'Downed wire → local electric cooperative immediately; keep 10 m away'
                    ]},
                    { h: 'During emergencies', kind: 'list', items: [
                        'Do not create rumors in group chats — verify with official channels',
                        'Give way to ambulances and fire trucks; pull to the right and stop',
                        'Do not rubberneck accidents — you block responders'
                    ]}
                ]},
                { name: 'Road', icon: 'route', sections: [
                    { h: 'Defensive driving', kind: 'list', items: [
                        'Two-second following distance in dry, four seconds in rain',
                        'Never use your phone while driving — pull over',
                        'Headlights on during rain, even in daytime',
                        'Scan 15 seconds ahead for brake lights and opening doors'
                    ]},
                    { h: 'Motorcycles & bicycles', kind: 'list', items: [
                        'Always wear an approved helmet, chin strap buckled',
                        'Ride where drivers can see you; wear reflective strips at night',
                        'Never lane-split during heavy rain or on slick paint'
                    ]},
                    { h: 'Pedestrians', kind: 'list', items: [
                        'Cross at designated lanes; make eye contact with drivers',
                        'Put the phone away — distracted walking is a top injury cause'
                    ]}
                ], callout: { kind: 'err', text: 'Road crashes kill 6 Filipinos every hour. Speed, drunk driving, and no helmet are the top three factors.' }}
            ]
        },

        procedures: {
            kicker: 'The three phases',
            title: 'Emergency Procedures',
            desc: 'A universal framework: what to do <b>before</b> disaster strikes, <b>during</b> the event, and <b>after</b> — for you and your family.',
            type: 'tabs',
            tabs: [
                { name: 'Before', icon: 'shield', sections: [
                    { h: 'Family emergency plan', kind: 'steps', items: [
                        'Pick two meeting points: one near home, one outside your barangay',
                        'Choose an out-of-town contact everyone can call',
                        'Every member memorizes phone numbers of 2 relatives + 911',
                        'Practice evacuation twice a year — walk the route, time it'
                    ]},
                    { h: 'Documents to safeguard', kind: 'list', items: [
                        'Birth/marriage certificates, land title, IDs, passport, vax card',
                        'Insurance, medical records, prescription list, spare keys',
                        'Physical copies in a fireproof bag + scans in email or cloud'
                    ]},
                    { h: 'Home hardening', kind: 'list', items: [
                        'Clean gutters and drains before rainy season',
                        'Trim branches overhanging the roof or powerline',
                        'Anchor the water tank, satellite dish, and roof sheets'
                    ]}
                ]},
                { name: 'During', icon: 'warn', sections: [
                    { h: 'Universal rules', kind: 'steps', items: [
                        '<b>STOP.</b> Take 3 slow breaths — panic kills more than hazards',
                        '<b>LOOK.</b> Identify the actual threat: fire? water? falling debris?',
                        '<b>ACT.</b> Follow the specific procedure for that hazard',
                        '<b>COMMUNICATE.</b> One short text: "SAFE / evacuating to X" — do not call if lines are jammed'
                    ]},
                    { h: 'Communication discipline', kind: 'list', items: [
                        'Text <b>before</b> calling — SMS works when voice fails',
                        'Use one designated contact as the family information hub',
                        'Conserve phone battery: brightness low, airplane mode when not sending',
                        'Battery radio + PAGASA/LGU Facebook page as backup'
                    ]},
                    { h: 'When to evacuate', kind: 'callout', text: '<b>Immediately, without waiting for permission, when:</b> you see the hazard approaching, your structure is damaged, or barangay gives a mandatory order. Nothing you own is worth your life.' }
                ]},
                { name: 'After', icon: 'check', sections: [
                    { h: 'First 30 minutes', kind: 'steps', items: [
                        'Head-count your household at the meeting point',
                        'Check for injuries — apply first aid before moving injured people',
                        'Photograph damage from a safe distance for claims',
                        'Report casualties to barangay health worker or 911'
                    ]},
                    { h: 'First 72 hours', kind: 'list', items: [
                        'Boil or treat all drinking water',
                        'Sleep in a declared safe structure — not your damaged home',
                        'Watch for snakes, rats, scorpions displaced by flood',
                        'Keep children away from debris piles and flood water'
                    ]},
                    { h: 'Recovery', kind: 'list', items: [
                        'Get a barangay certification of damage for government aid',
                        'File insurance claims within 30 days with photos + police blotter',
                        'Watch for mental-health signals in kids — nightmares, regression, refusal to eat'
                    ]}
                ]}
            ]
        },

        firstaid: {
            kicker: 'The first 4 minutes matter',
            title: 'First Aid',
            desc: 'Step-by-step protocols you can perform while waiting for EMS. Always call 911 first, then begin care.',
            type: 'tabs',
            tabs: [
                { name: 'CPR', icon: 'heart', tone: 'danger', sections: [
                    { h: 'Check responsiveness', kind: 'steps', items: [
                        'Tap shoulders, shout loudly. Look for chest movement 10 seconds max',
                        'If unresponsive and not breathing normally → <b>call 911, get AED</b>',
                        'Tilt head back, chin lifted — open the airway'
                    ]},
                    { h: 'Compressions', kind: 'steps', items: [
                        'Heel of hand on the <b>lower half of the breastbone</b>, other hand on top, fingers interlocked',
                        'Arms straight, shoulders over hands, push hard and fast',
                        'Depth: <b>5–6 cm</b>. Rate: <b>100–120 per minute</b> (beat of "Stayin\' Alive")',
                        'Allow full recoil between compressions. Do not lean on the chest'
                    ]},
                    { h: 'Breaths (if trained)', kind: 'list', items: [
                        '30 compressions → 2 rescue breaths (each 1 second, chest just rises)',
                        'If untrained or unwilling, do <b>compression-only CPR</b> — still saves lives'
                    ]},
                    { h: 'AED use', kind: 'list', items: [
                        'Turn on, follow voice prompts',
                        'Bare chest, place pads as pictured, everyone clear during analysis and shock',
                        'Resume compressions immediately after shock'
                    ]}
                ], callout: { kind: 'err', text: 'Every minute without CPR drops survival by <b>10%</b>. Start within 60 seconds of collapse.' }},
                { name: 'Bleeding', icon: 'heart', tone: 'danger', sections: [
                    { h: 'Direct pressure', kind: 'steps', items: [
                        'Cover wound with clean cloth, press hard with the heel of your hand for 10 minutes <b>without peeking</b>',
                        'If blood soaks through, add more cloth on top — do <b>not</b> remove the first layer',
                        'Elevate the injured limb above the heart if no fracture is suspected'
                    ]},
                    { h: 'Severe / spurting', kind: 'steps', items: [
                        'Apply a <b>tourniquet</b> 5 cm above the wound (never on a joint)',
                        'Tighten until bleeding stops. Note the time written on the skin',
                        'Do <b>not</b> loosen once applied — that is a job for EMS'
                    ]},
                    { h: 'Never do', kind: 'list', items: [
                        'Do not apply coffee grounds, toothpaste, or ash to wounds',
                        'Do not attempt to remove an impaled object — stabilize in place',
                        'Do not use a tourniquet on head, neck, or torso'
                    ]}
                ]},
                { name: 'Burns', icon: 'fire', tone: 'warn', sections: [
                    { h: 'Cool it — first 20 minutes', kind: 'steps', items: [
                        'Hold the burn under <b>cool running water</b> for 20 minutes (not ice, not ice water)',
                        'Remove rings, watches, tight clothing near the area before swelling starts',
                        'Do NOT pop blisters — the skin underneath is sterile'
                    ]},
                    { h: 'Cover', kind: 'steps', items: [
                        'Loosely cover with clean, non-fluffy cloth or cling film (do not wrap tight)',
                        'Do not apply butter, oil, toothpaste, egg, or "burn oil"'
                    ]},
                    { h: 'Seek emergency care when', kind: 'list', items: [
                        'Burn is larger than the victim\'s palm',
                        'White, charred, or painless skin (3rd degree)',
                        'Face, hands, feet, genitals, joints, or airway involved',
                        'Electrical or chemical burn (may look small but destroys deep tissue)'
                    ]}
                ], callout: { kind: 'warn', text: '<b>The 20-minute cool-water rule</b> is the single most effective first-aid action — reduces depth of injury and pain.' }},
                { name: 'Choking', icon: 'warn', tone: 'danger', sections: [
                    { h: 'Can they cough or speak?', kind: 'list', items: [
                        'Yes, forceful cough → encourage coughing, do NOT intervene',
                        'Silent, cannot breathe, clutching throat → begin abdominal thrusts'
                    ]},
                    { h: 'Heimlich (adults & children > 1 yr)', kind: 'steps', items: [
                        'Stand behind, one foot between theirs. Wrap arms around waist',
                        'Make a fist thumb-side in, above the navel, below the ribs',
                        'Grasp fist with the other hand. <b>Quick upward thrusts</b> — 5 in a row',
                        'Repeat until object comes out or victim goes unconscious'
                    ]},
                    { h: 'Infants under 1 year', kind: 'steps', items: [
                        'Face-down along your forearm, head lower than body, support jaw',
                        '<b>5 back slaps</b> between shoulder blades with heel of hand',
                        'Turn face-up, <b>5 chest thrusts</b> with 2 fingers on sternum',
                        'Alternate until object clears. Never use Heimlich on an infant'
                    ]},
                    { h: 'If they pass out', kind: 'list', items: [
                        'Lay flat, begin CPR — each time you open the airway, look for the object',
                        'Never do blind finger sweeps — you push it deeper'
                    ]}
                ]},
                { name: 'Fractures', icon: 'kit', tone: 'warn', sections: [
                    { h: 'Signs', kind: 'list', items: [
                        'Deformity, swelling, severe pain, refusal to move, grinding sensation',
                        'Open (compound) fracture: bone pierces skin — high infection risk'
                    ]},
                    { h: 'What to do', kind: 'steps', items: [
                        'Do not try to straighten the limb',
                        'Immobilize as-is: padded splint (board, rolled magazine) tied above and below the break',
                        'Apply cold pack wrapped in cloth 20 min on / 20 min off',
                        'For open fracture: cover with clean damp cloth, do NOT push bone back'
                    ]},
                    { h: 'Susppected spine or neck', kind: 'callout', text: '<b>Do not move the person.</b> Hold head in line with body, wait for trained responders. Move only if in immediate danger (fire, flood).' }
                ]},
                { name: 'Wounds', icon: 'heart', tone: 'ok', sections: [
                    { h: 'Minor cuts', kind: 'steps', items: [
                        'Wash your hands or wear gloves or a plastic bag first',
                        'Rinse the cut under clean running water for 5 minutes; wash around, not into, the wound',
                        'Apply clean pressure to stop bleeding, then antibiotic ointment and a bandage'
                    ]},
                    { h: 'Deep, dirty, or rusty', kind: 'list', items: [
                        'Any puncture wound (nail, thorn, animal bite) — go to a hospital for tetanus prophylaxis',
                        'Animal bites: wash 15 min with soap and water, then rabies post-exposure at an Animal Bite Center within 24 hours'
                    ]}
                ]}
            ]
        },

        evacuation: {
            kicker: 'Leave early, leave safely',
            title: 'Evacuation Guide',
            desc: 'How to plan, pack, move, register, and reunite your household during a mandatory or self-initiated evacuation.',
            type: 'tabs',
            tabs: [
                { name: 'Plan', icon: 'route', sections: [
                    { h: 'Know your route', kind: 'list', items: [
                        'Two routes to your barangay evacuation center — one primary, one backup if the first is flooded',
                        'Walk it once with children and elderly so they memorize landmarks',
                        'Note elevated buildings along the way that could serve as shelter'
                    ]},
                    { h: 'Family roles', kind: 'steps', items: [
                        'Who grabs the go-bag?',
                        'Who leads, who sweeps, who closes gas and electric?',
                        'Who carries the infant or assists the PWD member?'
                    ]},
                    { h: 'Head-count tracker', kind: 'callout', text: 'Use the <b>My Household</b> tab on this screen. Update it in real time during evacuation and show it to barangay personnel when you arrive at the center.' }
                ]},
                { name: 'Pack', icon: 'kit', sections: [
                    { h: 'Go-bag priority order', kind: 'steps', items: [
                        '1. Prescription meds (7 days), first aid kit, glasses',
                        '2. IDs + cash (small bills) in a waterproof pouch',
                        '3. Water (1L per person) + high-energy food',
                        '4. Torch + batteries + power bank + whistle',
                        '5. Change of clothes + rain jacket + sturdy slippers',
                        '6. Phone + charger, battery radio',
                        '7. Baby supplies, sanitary pads, wet wipes, trash bags'
                    ]},
                    { h: 'Do NOT pack', kind: 'list', items: [
                        'Laptops, heirlooms, framed photos — you can replace things, not people',
                        'Anything you cannot carry in one backpack comfortably for 2 km'
                    ]}
                ]},
                { name: 'Travel', icon: 'home', sections: [
                    { h: 'On foot', kind: 'list', items: [
                        'Wear closed shoes and reflective or bright clothing',
                        'Walk facing traffic if on road; children between adults, hold a rope',
                        'Do not cross flooded sections — detour, even if it adds 20 minutes',
                        'Whistle signal agreed in family: <b>3 blasts = stop / regroup</b>'
                    ]},
                    { h: 'By vehicle', kind: 'list', items: [
                        'If water stalls the engine, abandon the vehicle and continue on foot',
                        'Never drive through moving water above 30 cm'
                    ]}
                ]},
                { name: 'My Household', icon: 'users', custom: 'headcount' },
                { name: 'At center', icon: 'check', sections: [
                    { h: 'Register on arrival', kind: 'steps', items: [
                        'Report to the evacuation registration desk with your family head-count',
                        'Give names, ages, and medical needs of every member',
                        'Ask which section your family is assigned to; memorize it'
                    ]},
                    { h: 'Hygiene & safety', kind: 'list', items: [
                        'Wash hands with soap before eating — cholera/dysentery risk rises fast',
                        'Sleep on a raised surface; keep your bag under your head to prevent theft',
                        'Report fever, cough, or wound to the health worker immediately',
                        'Do not cook inside the sleeping area; use the designated kitchen zone'
                    ]},
                    { h: 'Do not return home', kind: 'callout', text: 'Until the barangay or LGU declares the area safe. Even after water recedes, live wires, snakes, and structural collapse are still active hazards.' }
                ]}
            ]
        },

        kit: {
            kicker: 'Interactive checklist',
            title: '72-Hour Emergency Kit',
            desc: 'What to pack for 3 days of self-sufficiency. <b>Tap items to mark them as packed</b> — your progress is saved on this device.',
            type: 'checklist',
            storageKey: 'rn_kit_v1',
            categories: [
                { name: 'Water', items: [
                    { id: 'w1', label: 'Drinking water 3L per person', note: '1 gallon ≈ 3 days for 1 adult' },
                    { id: 'w2', label: 'Water purification tablets / unscented bleach' },
                    { id: 'w3', label: 'Reusable water container (empty for refilling)' }
                ]},
                { name: 'Food', items: [
                    { id: 'f1', label: 'Canned goods (tuna, sardines, corned beef) × 6', note: 'Choose food you actually eat' },
                    { id: 'f2', label: 'Biscuits, peanuts, dried fruit' },
                    { id: 'f3', label: 'Instant noodles or rice (needs water + heat)' },
                    { id: 'f4', label: 'Can opener + spoon + mug' },
                    { id: 'f5', label: 'Baby formula, baby food if applicable' },
                    { id: 'f6', label: 'Pet food + leash if applicable' }
                ]},
                { name: 'Light & Comms', items: [
                    { id: 'l1', label: 'Flashlight or headlamp' },
                    { id: 'l2', label: 'Extra batteries (D, AA, AAA)' },
                    { id: 'l3', label: 'Power bank, fully charged' },
                    { id: 'l4', label: 'Phone charging cable' },
                    { id: 'l5', label: 'Battery-powered radio', note: 'PAGASA updates when data is down' },
                    { id: 'l6', label: 'Whistle', note: 'Louder than shouting, uses no energy' },
                    { id: 'l7', label: 'Waterproof bag for phone + documents' }
                ]},
                { name: 'First Aid & Medical', items: [
                    { id: 'm1', label: 'First aid kit (bandages, gauze, tape, antiseptic)' },
                    { id: 'm2', label: '7-day supply of prescription medicine' },
                    { id: 'm3', label: 'Pain reliever (paracetamol / ibuprofen)' },
                    { id: 'm4', label: 'Anti-diarrhea, antacid, oral rehydration salts' },
                    { id: 'm5', label: 'Tweezers, scissors, safety pins' },
                    { id: 'm6', label: 'Face masks (N95 + surgical)' },
                    { id: 'm7', label: 'Gloves (nitrile)' },
                    { id: 'm8', label: 'Copies of prescriptions + medical history' }
                ]},
                { name: 'Documents', items: [
                    { id: 'd1', label: 'Government IDs — photocopies in waterproof pouch' },
                    { id: 'd2', label: 'Birth / marriage certificates' },
                    { id: 'd3', label: 'Land title or lease contract copies' },
                    { id: 'd4', label: 'Insurance policies + emergency contact sheet' },
                    { id: 'd5', label: 'Passport / school IDs for kids' },
                    { id: 'd6', label: 'Cash in small bills (₱1,000–₱3,000)', note: 'ATMs and digital payments fail first' }
                ]},
                { name: 'Tools & Shelter', items: [
                    { id: 't1', label: 'Multi-tool or pocket knife' },
                    { id: 't2', label: 'Duct tape + plastic sheeting (tarp)' },
                    { id: 't3', label: 'Work gloves' },
                    { id: 't4', label: 'Matches in a waterproof container / lighter' },
                    { id: 't5', label: 'Portable stove + fuel' },
                    { id: 't6', label: 'Rope or paracord 10 m' },
                    { id: 't7', label: 'Emergency blanket (mylar)' }
                ]},
                { name: 'Clothing & Personal', items: [
                    { id: 'c1', label: 'One change of clothes per person' },
                    { id: 'c2', label: 'Rain jacket or poncho' },
                    { id: 'c3', label: 'Sturdy closed shoes' },
                    { id: 'c4', label: 'Underwear + socks × 3' },
                    { id: 'c5', label: 'Toothbrush, toothpaste, soap, shampoo' },
                    { id: 'c6', label: 'Sanitary pads, diapers, wet wipes' },
                    { id: 'c7', label: 'Trash bags (multi-purpose)' },
                    { id: 'c8', label: 'Eyeglasses or spare contacts' }
                ]}
            ]
        },

        hotlines: {
            kicker: 'Tap to call',
            title: 'Emergency Hotlines',
            desc: 'Philippine national emergency numbers and Western Visayas area hotlines. Most work even without load; 911 also accepts SMS.',
            type: 'hotlines',
            groups: [
                { name: 'National emergency', items: [
                    { name: 'Emergency hotline', num: '911', note: 'Police + Fire + Medical dispatch' },
                    { name: 'Philippine Red Cross', num: '143' },
                    { name: 'NDRRMC Operations Center', num: '(02) 8911-1406' },
                    { name: 'PNP (National Police)', num: '117' },
                    { name: 'Bureau of Fire Protection', num: '(02) 8426-0219' }
                ]},
                { name: 'Weather & geohazard', items: [
                    { name: 'PAGASA (weather)', num: '(02) 8284-0800' },
                    { name: 'PHIVOLCS (quake / volcano)', num: '(02) 8373-2335' },
                    { name: 'PAGASA flood forecast', num: '(02) 8284-0360' }
                ]},
                { name: 'Western Visayas & Capiz area', items: [
                    { name: 'Provincial Capitol, Roxas City', num: '(036) 884-0602' },
                    { name: 'Capiz Provincial PDRRMO', num: '(036) 888-2131' },
                    { name: 'Roxas City City Hall', num: '(036) 897-0243' },
                    { name: 'Roxas District Hospital', num: '(036) 888-2151' },
                    { name: 'Bacolod City rescue hotline', num: '(034) 433-2122' },
                    { name: 'Iloilo Provincial Capitol', num: '(033) 335-0311' }
                ]},
                { name: 'Utilities & roads', items: [
                    { name: 'REPCO / electric cooperative (Capiz)', num: '(036) 888-2031' },
                    { name: 'Maynilad water', num: '151' },
                    { name: 'DPWH road emergency', num: '(02) 8342-0818' },
                    { name: 'MMDA Traffic', num: '136' }
                ]}
            ],
            callout: { kind: 'info', text: '<b>Save 3 hotlines as contacts on your phone right now.</b> When the network is congested, SMS and voice both drop — but SMS often slips through.' }
        }
    };

    // ------------------------------------------------------------
    // Renderers
    // ------------------------------------------------------------
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCallout(c) {
        if (!c) return '';
        const kind = c.kind || 'info';
        const html = typeof c === 'string' ? c : c.text;
        return '<div class="g-callout ' + kind + '">' + html + '</div>';
    }

    function renderSection(sec) {
        if (!sec) return '';
        let body = '';
        if (sec.kind === 'steps') {
            body = '<ol class="g-steps">' + sec.items.map(i => '<li>' + i + '</li>').join('') + '</ol>';
        } else if (sec.kind === 'list') {
            body = '<ul class="g-list">' + sec.items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
        } else if (sec.kind === 'callout') {
            body = renderCallout({ kind: 'info', text: sec.text });
        } else {
            body = '<div class="g-card"><div class="g-s">' + (sec.items ? sec.items.join('<br>') : (sec.p || '')) + '</div></div>';
        }
        return '<div class="g-sec"><h4>' + esc(sec.h) + '</h4>' + body + '</div>';
    }

    function renderAccordion(items) {
        return items.map((it, i) => {
            const iconSvg = I[it.icon] || I.warn;
            const body = (it.sections || []).map(renderSection).join('') + renderCallout(it.callout);
            return '' +
                '<div class="g-acc" data-acc-idx="' + i + '">' +
                    '<div class="g-hd">' +
                        '<div class="g-ic">' + iconSvg + '</div>' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div class="g-tt">' + esc(it.name) + '</div>' +
                            (it.sub ? '<div class="g-st">' + esc(it.sub) + '</div>' : '') +
                        '</div>' +
                        '<div class="g-chev">' + I.chev + '</div>' +
                    '</div>' +
                    '<div class="g-bd">' + body + '</div>' +
                '</div>';
        }).join('');
    }

    function renderTabs(guide) {
        const tabbar = '<div class="g-tabs">' +
            guide.tabs.map((t, i) => {
                const tone = t.tone ? ' ' + t.tone : '';
                return '<button class="g-tab' + (i === 0 ? ' active' : '') + tone + '" data-gtab="' + i + '">' + esc(t.name) + '</button>';
            }).join('') +
            '</div>';
        const panels = guide.tabs.map((t, i) => {
            let inner = '';
            if (t.custom === 'headcount') inner = renderHeadcount();
            else inner = (t.sections || []).map(renderSection).join('') + renderCallout(t.callout);
            return '<div class="g-panel' + (i === 0 ? ' active' : '') + '" data-gpanel="' + i + '">' + inner + '</div>';
        }).join('');
        return tabbar + panels;
    }

    function renderChecklist(guide) {
        const saved = loadObj(guide.storageKey, {});
        const total = guide.categories.reduce((n, c) => n + c.items.length, 0);
        const done  = Object.keys(saved).filter(k => saved[k]).length;
        const pct   = total ? Math.round(done / total * 100) : 0;

        let html = '<div class="g-progress">' +
            '<div class="g-bar"><span style="width:' + pct + '%"></span></div>' +
            '<div class="g-lbl" id="gKitPct">' + done + ' / ' + total + ' · ' + pct + '%</div>' +
            '</div>';

        html += '<div class="g-actions">' +
            '<button type="button" class="btn ghost" data-kit-action="reset">Reset all</button>' +
            '<button type="button" class="btn ghost" data-kit-action="share">Print / Save</button>' +
            '</div>';

        guide.categories.forEach(cat => {
            html += '<div class="g-sec"><h4>' + esc(cat.name) + '</h4><ul class="g-check">';
            cat.items.forEach(it => {
                const isDone = !!saved[it.id];
                html += '<li data-kit="' + it.id + '"' + (isDone ? ' class="done"' : '') + '>' +
                    '<div class="cb">' + CHECK_SVG + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div class="g-lbl">' + esc(it.label) + '</div>' +
                        (it.note ? '<div class="g-note">' + esc(it.note) + '</div>' : '') +
                    '</div>' +
                    '</li>';
            });
            html += '</ul></div>';
        });
        return html;
    }

    function renderHeadcount() {
        const h = loadObj('rn_evac_head_v1', { adults: 2, children: 1, elderly: 0, pwd: 0, infants: 0, pets: 0 });
        const rows = [
            ['adults',   'Adults',      '18 – 59 yrs'],
            ['children', 'Children',    '2 – 17 yrs'],
            ['infants',  'Infants',     'Under 2 yrs'],
            ['elderly',  'Elderly',     '60+ yrs'],
            ['pwd',      'PWD',         'Any age'],
            ['pets',     'Pets / Livestock', 'Count for transport planning']
        ];
        let html = '<div class="g-callout info">Update this in real time during an evacuation. Bring your phone to the registration desk so barangay personnel can verify your family count at a glance.</div>';
        html += '<div class="hc-grid">';
        rows.forEach(r => {
            const k = r[0];
            html += '<div class="hc-cell">' +
                '<div class="hc-lbl">' + esc(r[1]) + '</div>' +
                '<div style="color:var(--muted);font-size:10.5px;margin-bottom:8px;">' + esc(r[2]) + '</div>' +
                '<div class="hc-row">' +
                    '<button type="button" class="hc-btn" data-hc="' + k + '" data-hc-op="-1" aria-label="Decrease">−</button>' +
                    '<div class="hc-num" data-hc-num="' + k + '">' + (h[k] | 0) + '</div>' +
                    '<button type="button" class="hc-btn" data-hc="' + k + '" data-hc-op="1" aria-label="Increase">+</button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
        const total = (h.adults | 0) + (h.children | 0) + (h.infants | 0) + (h.elderly | 0) + (h.pwd | 0);
        html += '<div class="g-sec" style="margin-top:16px;"><h4>Family total (humans)</h4>' +
                '<div class="g-card" style="display:flex;align-items:center;gap:14px;">' +
                    '<div style="font-size:34px;font-weight:800;color:var(--navy);line-height:1;" id="hcTotal">' + total + '</div>' +
                    '<div style="color:var(--muted);font-size:12px;line-height:1.5;">' +
                        'Water: <b style="color:var(--navy);">' + (total * 3) + ' L</b> per 3 days<br>' +
                        'Food: <b style="color:var(--navy);">' + (total * 3) + ' cups rice</b> or <b style="color:var(--navy);">' + (total * 6) + ' canned goods</b><br>' +
                        'Go-bags: <b style="color:var(--navy);">' + Math.max(1, Math.ceil(total / 3)) + '</b> backpack(s)' +
                    '</div>' +
                '</div></div>';
        html += '<div class="g-actions"><button type="button" class="btn ghost" data-hc-action="reset">Reset count</button></div>';
        return html;
    }

    function renderHotlines(guide) {
        let html = '';
        guide.groups.forEach(grp => {
            html += '<div class="g-sec"><h4>' + esc(grp.name) + '</h4>';
            grp.items.forEach(it => {
                const dial = String(it.num).replace(/[^0-9+]/g, '');
                html += '<a class="g-hotline" href="tel:' + dial + '">' +
                    '<div class="hl-ico">' + I.phone + '</div>' +
                    '<div class="hl-body">' +
                        '<div class="hl-name">' + esc(it.name) + '</div>' +
                        '<div class="hl-num">' + esc(it.num) + (it.note ? ' · ' + esc(it.note) : '') + '</div>' +
                    '</div>' +
                    '<div class="hl-go">Call ›</div>' +
                '</a>';
            });
            html += '</div>';
        });
        html += renderCallout(guide.callout);
        return html;
    }

    // ------------------------------------------------------------
    // Open a guide → render into #gdBody
    // ------------------------------------------------------------
    function openGuide(id) {
        const guide = DATA[id];
        if (!guide) return false;
        const body = document.getElementById('gdBody');
        const titleEl = document.getElementById('gdTopTitle');
        const subEl   = document.getElementById('gdTopSub');
        if (!body || !titleEl || !subEl) return false;

        titleEl.textContent = guide.title;
        subEl.textContent   = guide.kicker;

        let html = '<div class="guide-hero">' +
            '<div class="g-kicker">' + esc(guide.kicker) + '</div>' +
            '<div class="g-title">'  + esc(guide.title)  + '</div>' +
            '<div class="g-desc">'   + guide.desc        + '</div>' +
        '</div>';

        if (guide.type === 'accordion')       html += renderAccordion(guide.items);
        else if (guide.type === 'tabs')       html += renderTabs(guide);
        else if (guide.type === 'checklist')  html += renderChecklist(guide);
        else if (guide.type === 'hotlines')   html += renderHotlines(guide);

        html += '<div class="g-actions">' +
            '<button type="button" class="btn ghost" data-tab="guides">‹ Back to Guides</button>' +
            '<button type="button" class="btn primary" data-guide-share="' + id + '">Share guide</button>' +
        '</div>';

        body.innerHTML = html;
        body.setAttribute('data-guide-active', id);

        if (typeof window.goTo === 'function') window.goTo('guides-detail');
        else document.dispatchEvent(new CustomEvent('rn-go', { detail: 'guides-detail' }));

        window.scrollTo({ top: 0, behavior: 'instant' });
        return true;
    }

    // Expose
    window.RNGuides = { open: openGuide, DATA: DATA };

    // ------------------------------------------------------------
    // Delegated click handlers
    // ------------------------------------------------------------
    document.addEventListener('click', function (e) {
        // 1) Guide tile on the guides list screen
        const tile = e.target.closest('[data-guide]');
        if (tile) {
            e.preventDefault();
            e.stopPropagation();
            openGuide(tile.getAttribute('data-guide'));
            return;
        }

        // 2) Tab switch inside a tabbed guide
        const tab = e.target.closest('.g-tab');
        if (tab && tab.dataset.gtab != null) {
            const wrap = tab.closest('#gdBody');
            if (!wrap) return;
            wrap.querySelectorAll('.g-tab').forEach(el => el.classList.remove('active'));
            wrap.querySelectorAll('.g-panel').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            const panel = wrap.querySelector('.g-panel[data-gpanel="' + tab.dataset.gtab + '"]');
            if (panel) panel.classList.add('active');
            return;
        }

        // 3) Accordion toggle
        const acc = e.target.closest('.g-acc .g-hd');
        if (acc) { acc.parentElement.classList.toggle('open'); return; }

        // 4) Checklist toggle
        const ck = e.target.closest('.g-check > li[data-kit]');
        if (ck) {
            const active = document.getElementById('gdBody').getAttribute('data-guide-active');
            const guide = DATA[active];
            if (!guide || guide.type !== 'checklist') return;
            const key = ck.dataset.kit;
            const saved = loadObj(guide.storageKey, {});
            saved[key] = !saved[key];
            saveObj(guide.storageKey, saved);
            ck.classList.toggle('done', !!saved[key]);
            // recompute progress
            let total = 0, done = 0;
            guide.categories.forEach(c => c.items.forEach(it => { total++; if (saved[it.id]) done++; }));
            const pct = total ? Math.round(done / total * 100) : 0;
            const bar = document.querySelector('#gdBody .g-progress .g-bar > span');
            const lbl = document.getElementById('gKitPct');
            if (bar) bar.style.width = pct + '%';
            if (lbl) lbl.textContent = done + ' / ' + total + ' · ' + pct + '%';
            return;
        }

        // 5) Reset kit
        const kitAction = e.target.closest('[data-kit-action]');
        if (kitAction) {
            if (kitAction.dataset.kitAction === 'reset') {
                if (!confirm('Reset all 72-hour kit checklist items?')) return;
                const active = document.getElementById('gdBody').getAttribute('data-guide-active');
                const guide = DATA[active];
                saveObj(guide.storageKey, {});
                openGuide(active);
            } else if (kitAction.dataset.kitAction === 'share') {
                window.print();
            }
            return;
        }

        // 6) Headcount +/- buttons
        const hc = e.target.closest('.hc-btn[data-hc]');
        if (hc) {
            const k = hc.dataset.hc, op = parseInt(hc.dataset.hcOp, 10);
            const h = loadObj('rn_evac_head_v1', { adults: 2, children: 1, elderly: 0, pwd: 0, infants: 0, pets: 0 });
            h[k] = Math.max(0, Math.min(30, (h[k] | 0) + op));
            saveObj('rn_evac_head_v1', h);
            const numEl = document.querySelector('[data-hc-num="' + k + '"]');
            if (numEl) numEl.textContent = h[k];
            const total = (h.adults | 0) + (h.children | 0) + (h.infants | 0) + (h.elderly | 0) + (h.pwd | 0);
            const totEl = document.getElementById('hcTotal');
            if (totEl) {
                totEl.textContent = total;
                const card = totEl.parentElement;
                const lines = card.querySelectorAll('div > b');
                // Refresh suggested quantities (rebuild whole block safely)
                const sugg = card.nextElementSibling; // nothing needed — we'll rerender
                if (sugg) { /* no-op */ }
                // Update the text list directly:
                const infoDiv = card.children[1];
                if (infoDiv) {
                    infoDiv.innerHTML =
                        'Water: <b style="color:var(--navy);">' + (total * 3) + ' L</b> per 3 days<br>' +
                        'Food: <b style="color:var(--navy);">' + (total * 3) + ' cups rice</b> or <b style="color:var(--navy);">' + (total * 6) + ' canned goods</b><br>' +
                        'Go-bags: <b style="color:var(--navy);">' + Math.max(1, Math.ceil(total / 3)) + '</b> backpack(s)';
                }
            }
            return;
        }

        // 7) Reset headcount
        const hcReset = e.target.closest('[data-hc-action="reset"]');
        if (hcReset) {
            if (!confirm('Reset family head-count?')) return;
            saveObj('rn_evac_head_v1', { adults: 2, children: 1, elderly: 0, pwd: 0, infants: 0, pets: 0 });
            const active = document.getElementById('gdBody').getAttribute('data-guide-active');
            openGuide(active || 'evacuation');
            // Jump to the "My Household" tab (index 3)
            setTimeout(function () {
                const t = document.querySelector('.g-tab[data-gtab="3"]');
                if (t) t.click();
            }, 40);
            return;
        }

        // 8) Share guide (Web Share API when available, else copy summary)
        const share = e.target.closest('[data-guide-share]');
        if (share) {
            const id = share.dataset.guideShare;
            const guide = DATA[id];
            if (!guide) return;
            const text = 'RescueNet guide — ' + guide.title + ': ' + guide.desc.replace(/<[^>]+>/g, '');
            if (navigator.share) {
                navigator.share({ title: guide.title, text: text }).catch(() => {});
            } else {
                try {
                    navigator.clipboard.writeText(text);
                    alert('Guide summary copied to clipboard.');
                } catch (err) {
                    alert(text);
                }
            }
            return;
        }
    }, true);

    // Keyboard support for guide tiles
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const tile = e.target.closest && e.target.closest('[data-guide]');
        if (tile) { e.preventDefault(); openGuide(tile.getAttribute('data-guide')); }
    });

})();
