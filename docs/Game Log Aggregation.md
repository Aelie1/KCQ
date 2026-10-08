# Game Log aggregation (pass 1)

The pure `createGameLogEntries` helper in `src/ui/presentation/gameLog.ts` produces semantic presentation data. It does not render text or change the graphical log. Entity, move, binding, buff, stance and phase IDs can be localized through the existing `Presentation` methods; `StringTable` stays in Presentation.

Pass post-event frames and the state captured immediately before the action:

```ts
const initialState = engine.getGameState();
const result = engine.executeAction(action);
if (result.success) {
    const entries = createGameLogEntries(result.frames, initialState);
}
```

Bare `GameEvent[]` also works. Endpoints that cannot be established from leaves remain unknown. Each frame supplies the baseline for the next event; a bare event breaks this snapshot chain. Grouping follows first occurrence, and target hit arrays retain their recorded order. Separate actions/events stay separate. Only consecutive stance-only events merge; reversals disappear when the initial stance is known. An intervening event ends the stance run, including an omitted load event. With an unknown initial stance, the final stance remains visible rather than assuming a reversal cancels.

## Representative output

These examples match the focused unit tests. JSON omits unknown/undefined fields. Buff details below preserve the public payloads, including optional `Buff.severity`, directly from snapshots. Severity is not derived from modifiers or statuses.

### Single-hit Telekinesis

```json
{
  "kind": "move", "actor": "ko", "move": "telekinesis",
  "outcomes": [{
    "kind": "damage", "target": "skunkette1",
    "hits": [{ "result": "hit", "damage": 18, "healing": 0, "blocked": 0 }],
    "damage": 18, "healing": 0, "blocked": 0
  }]
}
```

### Four-hit Rockfall with three Pounce reductions

One miss and three damaging hits yield one damage group and one logical Pounce group. Both linked participants retain their recorded severity endpoints, 4 → 1. The enemy's hit modifier changes from 8 to 2; the victim loses Helpless. The three pairs of `buffUpdated` leaves become one initial-to-final change, with both participants' complete, distinct payloads retained. A future graphical renderer can use `Presentation` to localize these endpoints as `Pounce IV → I`; the aggregation layer does not generate that label.

```json
{
  "kind": "move", "actor": "hinari", "move": "rockfall",
  "outcomes": [
    {
      "kind": "damage", "target": "skunkette1",
      "hits": [
        { "result": "miss",  "damage": 0,  "healing": 0, "blocked": 0 },
        { "result": "graze", "damage": 3,  "healing": 0, "blocked": 0 },
        { "result": "hit",   "damage": 8,  "healing": 0, "blocked": 0 },
        { "result": "crit",  "damage": 16, "healing": 0, "blocked": 0 }
      ],
      "damage": 27, "healing": 0, "blocked": 0
    },
    {
      "kind": "buff", "buff": "pounce",
      "participants": [
        {
          "target": "ko",
          "initial": { "present": true, "details": {
            "id": "pounce", "severity": 4, "linkedEntity": "skunkette1",
            "statuses": [{ "id": "immobilized", "value": 1 }, { "id": "helpless", "value": 1 }],
            "modifiers": {}, "moveList": { "addedMoves": ["throwOff"] }
          }},
          "final": { "present": true, "details": {
            "id": "pounce", "severity": 1, "linkedEntity": "skunkette1",
            "statuses": [{ "id": "immobilized", "value": 1 }],
            "modifiers": {}, "moveList": { "addedMoves": ["throwOff"] }
          }}
        },
        {
          "target": "skunkette1",
          "initial": { "present": true, "details": {
            "id": "pounce", "severity": 4, "linkedEntity": "ko", "modifiers": { "defense": -2, "hit": 8 }
          }},
          "final": { "present": true, "details": {
            "id": "pounce", "severity": 1, "linkedEntity": "ko", "modifiers": { "defense": -2, "hit": 2 }
          }}
        }
      ]
    }
  ]
}
```

The engine integration test separately executes a real three-hit damage action against the existing Skunkette mechanic and directly verifies severity 4 → 1 for both linked participants in one logical Pounce outcome. A non-Pounce severity-only fixture also verifies that payload preservation is generic and requires no modifiers or statuses.

### AoE Immolation

Each target gets its own ordered hit group:

```json
{
  "kind": "move", "actor": "matsuko", "move": "immolation",
  "outcomes": [
    { "kind": "damage", "target": "skunkette1", "hits": [{ "result": "graze", "damage": 6, "healing": 0, "blocked": 0 }], "damage": 6, "healing": 0, "blocked": 0 },
    { "kind": "damage", "target": "skunkette2", "hits": [{ "result": "crit", "damage": 24, "healing": 0, "blocked": 0 }], "damage": 24, "healing": 0, "blocked": 0 }
  ]
}
```

This fixture isolates the attack's target damage. An actual Immolation event can also contain binding reductions and Burnout; those become binding/buff outcomes in the same entry.

### Escape with a trap-related binding increase and an escape reduction

The binding leaves +23, −5 and 4 blocked become this outcome:

```json
{
  "kind": "binding", "target": "ko", "binding": "latexArms",
  "change": 18, "blocked": 4,
  "initial": { "value": 10, "level": "light" },
  "final": { "value": 28, "level": "moderate" }
}
```

### Consecutive stance changes

Starting with both characters moving: Ko stands, Hinari stands, Ko moves again. The resulting entry preserves only Hinari's change:

```json
{
  "kind": "stance",
  "changes": [{ "kind": "stance", "actor": "hinari", "initial": "moving", "final": "standing" }],
  "outcomes": []
}
```

## Intentional omissions and current data limits

- Cooldown bookkeeping and empty successful character/encounter loads are omitted. Load failures and meaningful setup outcomes remain visible.
- Damage/healing/blocking values come directly from leaves. Misses are retained, and zero-damage accuracy groups also preserve binding/buff attack results. Damage from callbacks to a different recipient keeps that recipient and uses the unknown/untested band `none`; it does not inherit the attacked target's roll.
- Binding endpoints and severity come from snapshots. Bare added/removed events supply a known zero endpoint, so actual emitted deltas can recover numeric endpoints. A known numeric endpoint and the emitted deltas can also recover the other numeric endpoint. Changed-only leaves without either endpoint cannot reveal an initial value or severity. No thresholds, potency or damage mechanics are recalculated.
- Buff leaves contain only an ID and add/update/remove operation. Snapshots supply complete public buff payloads, including optional numeric `severity`, modifiers, statuses, duration, move lists and reciprocal links. `BuffOutcome` preserves severity in each participant's `initial.details` and `final.details` without special-casing any buff. Missing severity remains absent, and bare leaves cannot establish it. Public buffs still have no active flag. Intermediate states are intentionally discarded. Linked removal uses the pre-event snapshot, including when a defeated enemy disappears. A linked buff created and removed wholly within one event has no surviving link in either endpoint; it cannot be reliably paired from its ID alone. Without enough snapshots, links and payloads remain unknown; unrelated participants are not guessed to be linked.
- Escape events omit the attempted binding ID and accuracy result. Binding outcomes identify any binding that actually changed; an interrupted/empty escape cannot identify the attempted binding from `GameEvent` alone.
- Phase events omit the round. Frames supply it; event-only input leaves it unknown.
- Trap trigger consumption is retained separately. Recorded trap endpoints supply net change; trigger-only traces without endpoints leave net change unknown. Current trap removal code does not emit the declared `trapRemoved` leaf.
- Refresh, interruption, spawn/defeat, final retarget destination and cancellation/weakening remain semantic outcomes. Intention leaves lack specific move IDs and weakening amounts, which are not invented.
- Public DataEffects have no leaf events. The existing player resource Subspace is summarized only when both recorded frame endpoints exist. Internal character/encounter data and silent buff ticks are not expanded into a technical trace.

Validation: `tests/ui/gameLogAggregation.test.ts` covers all eight required cases, linked Pounce severity endpoints (fixtures and engine-generated frames), generic non-Pounce severity changes, current leaf outcomes, unknown-data behavior, event boundaries and input immutability. Existing Game Log components and preview components are unchanged.
