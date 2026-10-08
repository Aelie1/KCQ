import { StringTable } from "../../src/ui/presentation/presentation";

export const eventEnglishStrings: StringTable = {
    "event.useMove.text": "{actor} uses {move}.",
    "event.useEscape.escape": "{actor} attempts to escape.",
    "event.useEscape.assist": "{actor} tries to assist {target}.",
    "event.changePhase.text": "{phase} phase begins.",
    "event.changeStance.text": "{actor} changes stance.",

    "event.loadCharacter.success": "{id} joins the party.",
    "event.loadCharacter.failure": "Could not load {id}.",
    "event.loadEncounter.success": "Encounter {id} begins.",
    "event.loadEncounter.failure": "Could not load encounter {id}.",

    "event.enemyDamaged.text": "{target} takes {amount} damage.",
    "event.enemyHealed.text": "{target} recovers {amount} health.",
    "event.damageBlocked.text": "{target} blocks {amount} damage.",

    "event.bondageChanged.text": "{target}'s {binding} changes by {amount}.",
    "event.bondageAdded.text": "{target} gains {amount} {binding}.",
    "event.bondageRemoved.text": "{target} escapes {binding}.",
    "event.bondageBlocked.text": "{target} blocks {amount} {binding}.",

    "event.buffAdded.text": "{target} gains {buff}.",
    "event.buffRemoved.text": "{buff} expires on {target}.",
    "event.buffUpdated.text": "{buff} refreshes on {target}.",

    "event.enemySpawned.text": "{target} appears.",
    "event.enemyDefeated.text": "{target} is defeated.",

    "event.stanceSet.text": "{actor} changes stance to {stance}.",

    "event.cooldownChanged.text": "{target}'s {move} cooldown changes to {value}.",

    "event.trapAdded.text": "{actor} adds {amount} {trap}.",
    "event.trapRemoved.text": "{actor} removes {amount} {trap}.",
    "event.trapTriggered.text": "{actor} triggers {amount} {trap}.",

    "event.actionInterrupted.text": "{actor}'s action is interrupted: {reason}",
    "event.actionRefreshed.text": "{target}'s action is refreshed.",

    "event.targetChanged.text": "{target}'s target changes to {destination}.",

    "event.intentionCancelled.text": "{target}'s action is cancelled.",
    "event.intentionWeakened.text": "{target}'s action is weakened.",
};
