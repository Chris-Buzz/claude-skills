# Psychology research for a design system

Each project's design system starts from who will use it and what state they are in when they do,
then from the owner's taste (`taste.md`). This file covers how to do that research and lists the principles that
usually matter. It is not a substitute for researching the project.

## The research pass (phase 2 of the skill)

Run it as one background subagent (`model: "sonnet"`) with WebSearch, so the main context keeps only
the summary. Brief it with:

1. **The person and their state.** Who opens this, where, and how they feel when they do: rushed,
   anxious, bored, browsing, buying, at work, on a phone in one hand. Name any condition that changes
   the design (ADHD, low vision, older users, kids, regulated trust: health, money, legal).
2. **The core jobs.** The two or three things the product must make effortless.
3. **The metaphor or theme**, if the project has one, and the real-world system it borrows from
   (transit boards, a paper planner, a cockpit). Ask what makes that system readable under stress.
4. **What to return:** findings in the form "finding -> design implication -> source URL", a list
   of 8-12 design rules for this product, and a list of claims to avoid. Ask for under 900 words.

Then cut it down to the rules that change a token, a component or a layout. Put those in the
project's `design/brief.md` under "Psychology", each with its source. The DS README cites them, so a
later session knows why a choice was made.

## Principles with decent evidence

Use these when the research shows they apply. Each one ends in a design implication.

- **Working memory, and Hick-Hyman with care.** Working memory holds about four chunks (Cowan), and
  the deficit is large in ADHD. Hick's law is about reaction time between equally likely choices,
  not menu length, and the mean "choice overload" effect is close to zero. Justify "one thing plus
  the next few" by load, and give one option the visual weight of a default.
- **Fitts's law.** Time to hit a target depends on its distance and size. Put primary actions in
  the thumb zone on phones, make them at least 44pt, and keep destructive actions away from them.
- **Cognitive load (Sweller) and working memory.** People hold only a few new chunks at once. Use
  one idea per screen region, label in place rather than via legends, and reveal detail
  progressively.
- **Gestalt: proximity, similarity, common region.** Grouping is read before reading starts. Space
  sets the hierarchy more cheaply than borders do, and identical treatment signals identical
  meaning, which is why uniformity reads as cohesion.
- **Preattentive attributes** (colour, size, motion, position). One differing element pops out.
  Spend the accent only on what must be found first.
- **Goal-gradient effect** (Kivetz et al. 2006; Bonezzi et al. 2011). Effort rises near the goal,
  and a head start helps, but motivation is U-shaped: lowest in the middle. Make step 1 trivially
  small, mark the midpoint, show distance to the finish ("2 stops left"), and don't show a long
  remaining queue.
- **Implementation intentions** (Gollwitzer and Sheeran, d = 0.65 over 94 tests). "When X, I will Y"
  plans raise follow-through, and they help ADHD inhibition in lab studies. This has the strongest
  evidence here. Pair each next step with a trigger and a concrete first action.
- **Closing loops, not Zeigarnik.** A 2025 meta-analysis found no memory advantage for unfinished
  tasks, only a tendency to resume them. Writing a specific plan reduces intrusive thoughts, so a
  clear receipt ("filed, here's where") closes the loop. Never justify nagging with Zeigarnik.
- **Attention residue** (Leroy). An unfinished task drags on the next one, and noting where you
  stopped helps. Ask for a "where I stopped" line when switching contexts.
- **Peak-end rule** (Kahneman). Experiences are remembered by their peak and their end. Make the
  finish of a flow (the receipt, the done state) the best-designed moment.
- **Aesthetic-usability effect** (Kurosu and Kashimura). Attractive interfaces are perceived as
  easier to use. Polish is functional, but it masks real usability problems in testing.
- **Recognition over recall** (Nielsen). Show the options, recent items and the current state
  instead of making people remember them.
- **Reduced motion and vestibular safety.** Honour `prefers-reduced-motion` and replace movement
  with cross-fades. Never loop animation behind text.

## Claims to treat with suspicion

- **Fixed colour meanings** ("blue = trust", "orange = cheap"). Colour associations depend on
  culture and context and are weak predictors of behaviour. Choose colour for contrast, hierarchy,
  brand and the subject's temperature, then justify it that way.
- **"Red increases urgency and conversions."** It depends on context. Red also signals error and
  failure; for lateness, amber often reads as "act soon" without alarm.
- **Gamification as motivation.** Streaks, XP and badges can create guilt and dependency, and that
  harms anxious and ADHD users most. Avoid them unless the brief asks for them.
- **The "7 plus or minus 2" rule for menus, and "Hick's law proves three options".** Neither holds.
  Use working-memory load and real task frequency instead.
- **Monotonic goal gradients and "unfinished tasks nag you".** Both are overstated (see above).
- **Vendor statistics** ("ADHD people underestimate time by 40-60%", "23 minutes to refocus"). These
  are unsourced. Don't put them in a brief or on a page.
- **Dark patterns sold as psychology:** false scarcity, confirmshaming, roach motels. Never use them.

## Accessibility is part of the psychology

Text contrast must be at least 4.5:1 (3:1 at 24px and up, and for icons, borders and focus rings).
Never use colour alone: pair it with a letter, number, shape or label. This is also why transit
lines carry letter bullets. Colours that must be told apart should differ in lightness, not only
in hue, and blue/orange separates better than red/green. Respect Dynamic Type, keep visible focus
states, and use real controls.
