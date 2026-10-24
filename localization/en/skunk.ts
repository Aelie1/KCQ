import { StringTable } from "../../src/ui/presentation/presentation";

export const skunkEnglishStrings: StringTable = {
    "campaign.skunk.prologue.name": "Prologue",
    "campaign.skunk.act1.name": "Act 1",
    "campaign.skunk.act2.name": "Act 2",
    "campaign.skunk.act3.name": "Act 3",
    "campaign.skunk.epilogue.name": "Epilogue",

    "entity.skunketteKo.name": "Skunkette Ko",
    "entity.skunketteMatsuko.name": "Skunkette Matsuko",
    "entity.skunketteHinari.name": "Skunkette Hinari",
    "entity.skunketteNaruyo.name": "Skunkette Naruyo",
    "entity.skunketteSakari.name": "Skunkette Sakari",

    "buff.skunked.name": "Fully Skunked",
    "buff.ambushed.name": "Ambushed!",
    "buff.collar.name": "Slave Collar",

    // Skunkette
    "entity.skunkette.generic": "Skunkette",
    "entity.skunkette.name": "Skunkette {index}",
    "entity.skunkette.desc": "An unfortunate girl that has been trapped on her elbows and knees by a suit of living latex. The latex itself controls her body, and she can only watch on as she assaults anyone nearby, trying to create more skunks.",
    "entity.skunketteQueen.name": "Skunkette Queen",
    "entity.skunketteQueen.desc": "The former Skunk Queen, reduced to a minion after her failure.",
    "entity.skunkette.rules": "Below 40% HP, the Skunkette suffers Potency −4 and Defense −1.\nEach time the Skunkette takes damage, [moves:pounce] loses one severity level. \nDefeating a Skunked character frees them from the latex's control and halves their bindings.",
    "entity.skunkette.strategy": "If currently pouncing a character, the Skunkette uses [moves:latexSpray] on that character.\nOtherwise, if [moves:pounce] is available, it chooses a random valid character who is not already pounced.\nOtherwise, it chooses [moves:latexMist] or [moves:latexSpray] with equal probability. Spray targets a random valid character and body-zone binding, while Mist hits all characters.",
    "difficulty.extreme.skunkette": "Gets a followup Latex Spray on strong hits as well as criticals.",
    "difficulty.mythic.skunkette": "Gets a followup Latex Spray on any hit.",

    "move.latexSpray.name": "Latex Spray",
    "move.latexSpray.desc": "Spray living latex onto an opponent.",
    "move.latexSpray.narrative.miss": "{actor} sprays liquid latex at {targets}, but is unable to land a hit.",
    "move.latexSpray.narrative.graze": "{actor} squirts latex at {targets}, who gets a little bit {hitLocation}.",
    "move.latexSpray.narrative.hit": "{actor} sprays a stream of latex at {targets}, who takes a decent hit {hitLocation}.",
    "move.latexSpray.narrative.crit": "{actor}'s latex spray at {targets} is like a fire hose and explodes {hitLocation}.",
    "move.pounce.name": "Pounce",
    "move.pounce.desc": "Pin a victim, with stronger restrictions or even follow-up attacks at higher severity. Grip deteriorates with damage taken.",
    "move.pounce.effect.spray": "[moves:latexSpray]",
    "move.pounce.narrative.miss": "{actor} tries to pounce on {targets}, who manages to dodge out of the way.",
    "move.pounce.narrative.hit": "{actor} pounces on {targets}...",
    "move.latexMist.name": "Latex Mist",
    "move.latexMist.desc": "This black mist causes Skunk Bindings to become more active and grow on their own.",
    "move.latexMist.effect.onCrit": "All existing bindings",
    "move.latexMist.effect.onHit": "One existing binding",
    "move.latexMist.effect.spread.note": "Spread modifier is random between +1 and +5.",
    "move.latexMist.narrative.miss": "{actor} releases a cloud of black mist, but it dissipates harmlessly without affecting anyone.",
    "move.latexMist.narrative.hit": "{actor} releases a cloud of black mist. {targets} cannot avoid the attack!",
    "move.latexMist.narrative.crit": "{actor}'s mist engulfs {targets} within a dense black fog.",
    "move.throwOff.name": "Throw Off",
    "move.throwOff.desc": "Try to throw a pouncing Skunkette off of you!",
    "move.throwOff.effect.cooldown": "[moves:pounce] · 2 rounds",
    "move.throwOff.narrative.miss": "{actor} tries to free herself, but is unable to throw the skunkette off of her.",
    "move.throwOff.narrative.hit": "{actor} throws the skunkette off and scrambles to her feet, ready to continue the fight!",
    "move.throwOff.narrative.hit.suppress": "buff.pounce.narrative.removed.characters*",
    "move.throwOff.source": "[enemies:skunkette]",

    "buff.pounce.name": "Pounce",
    "buff.pounce.narrative.added.1": "but they barely get a hold on them!",
    "buff.pounce.narrative.added.2": "and holds her arms to the ground!",
    "buff.pounce.narrative.added.3": "and lands on her back, keeping her from fighting back!",
    "buff.pounce.narrative.added.4": "and forces her to the ground! The skunkette lands on her stomach, with her arms behind her... With the skunk pressing her body to the ground, she is helpless to resist!",
    "buff.pounce.narrative.removed.characters": "The attack knocks the skunkette off of {target} in the process!",
    "buff.pounce.allow": "",
    "buff.latexMist.name": "Latex Mist",
    "buff.latexMist.narrative.added.1": "They barely notice their bindings starting to come alive",
    "buff.latexMist.narrative.added.2": "The latex on their bodies starts to ripple.",
    "buff.latexMist.narrative.added.3": "Their bindings awaken and start to react to attempts to remove them.",
    "buff.latexMist.narrative.added.4": "The latex on their bodies starts to spread across their bodies.",
    "buff.latexMist.narrative.added.5": "Their bindings surge with life as it starts to grow any time it is touched.",
    "buff.resistance.name": "Victim Resistance",
    "buff.resistance.narrative.added": "The girl inside the skunk suit starts to resist its control!",
    "buff.skunkette.name": "Skunkette",
    "buff.player.name": "Character",

    // Skunk
    "entity.skunk.generic": "Skunk",
    "entity.skunk.name": "Skunk {index}",
    "entity.skunk.desc": "A cute forest animal... with a high gloss sheen. It sprays latex on anything that threatens it, and it covers the area in puddles!",
    "entity.skunkEmpress.name": "Skunk Empress",
    "entity.skunkEmpress.desc": "The former Skunk Empress, reduced to a minion after her failure.",
    "entity.skunk.rules": "When it falls below 20%, it changes its next move to [moves:latexExplosion] against the attacker.",
    "entity.skunk.strategy": "Below 20% HP, the Skunk uses [moves:latexExplosion] against the most bound character. If nobody is bound, it chooses a random valid character.\nIt may use [moves:latexPuddle] to replenish the arena's puddles. This is more likely when there are less puddles present.\nIt may use [moves:latexRegeneration] on the character with the most potential regeneration. This becomes more likely as the potential regeneration grows.\nUses [moves:latexShower] on a random valid character and location.",
    "difficulty.extreme.skunk": "Survives Latex Explosion when it hits a target.",
    "difficulty.mythic.skunk": "Survives Latex Explosion whether it hits or misses.",

    "move.latexShower.name": "Latex Shower",
    "move.latexShower.desc": "Shower a character’s body with living latex.",
    "move.latexShower.narrative.miss": "{actor} creates a shower out of liquid latex that falls on {targets}, but is too thin to matter.",
    "move.latexShower.narrative.graze": "{actor} creates a drizzle of latex over {targets}, who gets a little latex {hitLocation}.",
    "move.latexShower.narrative.hit": "{actor} shoots a stream of latex at {targets} who gets some {hitLocation}.",
    "move.latexShower.narrative.crit": "{actor} drenches {targets} in latex {hitLocation}.",
    "move.latexPuddle.name": "Latex Puddle",
    "move.latexPuddle.desc": "Spray the ground, trees, and everything else nearby in latex, causing characters to get covered a little more every time they move.",
    "move.latexPuddle.narrative.graze": "{actor} squirts a little latex onto the ground around them.",
    "move.latexPuddle.narrative.hit": "{actor} creates more puddles on the ground.",
    "move.latexPuddle.narrative.crit": "{actor} covers the nearby ground in a veritable sea of latex.",
    "move.latexRegeneration.name": "Latex Regeneration",
    "move.latexRegeneration.desc": "Skunk magic regenerates partially escaped bindings to their highest reached level.",
    "move.latexRegeneration.effect.onGraze": "One Binding",
    "move.latexRegeneration.effect.onHit": "One Binding",
    "move.latexRegeneration.effect.onCrit": "All Bindings",
    "move.latexRegeneration.narrative.miss": "{actor} tries to regenerate {targets}'s bindings, but the latex does not react.",
    "move.latexRegeneration.narrative.graze": "{actor} causes {targets} bindings to partially regenerate {hitLocation}.",
    "move.latexRegeneration.narrative.hit": "{actor} causes {targets} bindings {hitLocation} to regenerate completely.",
    "move.latexRegeneration.narrative.crit": "{actor}'s magic causes {targets} bondage to completely regenerate {hitLocation}.",
    "move.latexExplosion.name": "Latex Explosion",
    "move.latexExplosion.desc": "The Latex Skunk destabilizes when it is severely damaged, exploding into a wave of latex that drenches its target.",
    "move.latexExplosion.effect.binding.note": "Explosion hits all four body zones simultaneously.",
    "move.latexExplosion.effect.defeat": "Latex Skunk",
    "move.latexExplosion.narrative.miss": "{actor} tries to explode on {targets}, but misses and turns into a pool of latex instead.",
    "move.latexExplosion.narrative.graze": "{actor} tries to explode on {targets}, but only manages a glancing blow.",
    "move.latexExplosion.narrative.hit": "{actor} tries to explode on {targets} and hits her square in the chest!",
    "move.latexExplosion.narrative.crit": "{actor} tries to explode on {targets} and explodes right in her face!  Additionally, it somehow survived the explosion and even healed its wounds during the explosion.",

    // Fairy
    "entity.fairy.generic": "Fairy",
    "entity.fairy.name": "Fairy {index}",
    "entity.fairy.desc": "A tiny skunk with fairy wings. Just what kind of experiment created this being?",
    "entity.fairy.strategy": "The Fairy chooses one of three support actions: healing Skunkettes or Skunks with [moves:healingMagic], shield an ally using [moves:barrierMagic], or strengthen an ally with [moves:empoweringMagic].\nIf there are no valid support targets, it uses [moves:bindingMagic] on a random valid character.",
    "difficulty.extreme.fairy": "Has a 50% chance to use Binding Magic as an extra attack each turn.",
    "difficulty.mythic.fairy": "Uses Binding Magic as an extra attack each turn.",

    "move.bindingMagic.name": "Binding Magic",
    "move.bindingMagic.desc": "Skunk magic animates nearby latex to attack its target.",
    "move.bindingMagic.narrative.miss": "{actor} shoots a beam of magic at {targets}, but it is easily deflected.",
    "move.bindingMagic.narrative.graze": "{actor} shoots a flickering beam of magic at {targets} and it turns into a bit of latex {hitLocation}.",
    "move.bindingMagic.narrative.hit": "{actor} shoots a beam of magic at {targets} and it spreads latex {hitLocation}.",
    "move.bindingMagic.narrative.crit": "{actor} shoots a blinding beam of magic at {targets} that covers her {hitLocation}.",
    "move.healingMagic.name": "Healing Magic",
    "move.healingMagic.desc": "Uses latex to fill in the gaps in its allies' bodies, healing damage they have taken.",
    "move.healingMagic.effect.others.note": "Heals all damaged [enemies:skunkette], [enemies:skunk], and [enemies:fairy].",
    "move.healingMagic.narrative.hit": "{actor} shoots a beam of magic at {targets} and it causes them to regenerate the latex forming their body.",
    "move.healingMagic.narrative.crit": "{actor} emits a wave of healing magic that allows all its allies to regenerate!",
    "move.empoweringMagic.name": "Empowering Magic",
    "move.empoweringMagic.desc": "Arcane fairy magic causes its allies' next attacks to become strangely powerful.",
    "move.empoweringMagic.effect.others.note": "Empowers all [enemies:skunkette], [enemies:skunk], [enemies:fairy], and [enemies:queen].",
    "move.empoweringMagic.narrative.hit": "{actor} shoots a beam of magic at {targets} and it causes the latex on their bodies to shine with a powerful might.",
    "move.empoweringMagic.narrative.crit": "{actor} emits a wave of empowering magic that causes all of its allies to shine with power!",
    "move.barrierMagic.name": "Barrier Magic",
    "move.barrierMagic.desc": "A translucent black shield protects an enemy from incoming damage. Absorbing hits drains duration.",
    "move.barrierMagic.narrative.graze": "{actor} erects a weak-looking shield around {targets}. It looks like it can barely stop a hit.",
    "move.barrierMagic.narrative.hit": "{actor} erects a shield around {targets} that will surely block a blow or two.",
    "move.barrierMagic.narrative.crit": "{actor} erects an extremely sturdy shield around {targets}!",

    "buff.empoweringMagic.name": "Empowering Magic",
    "buff.barrierMagic.name": "Barrier Magic",

    // Rainmaker    
    "entity.rainmaker.generic": "Rainmaker",
    "entity.rainmaker.name": "Rainmaker {index}",
    "entity.rainmaker.desc": "A creation of an insane genius. It sprays latex everywhere, covering everyone in the vicinity!",
    "entity.rainmaker.strategy": "Uses [moves:latexRain] every turn against the entire party.",
    "difficulty.extreme.rainmaker": "Explodes into 50 Latex Puddles when defeated.",
    "difficulty.mythic.rainmaker": "Explodes into 100 Latex Puddles when defeated.",

    "move.latexRain.name": "Latex Rain",
    "move.latexRain.desc": "This contraption only has one function, and that is to rain latex across the battlefield, soaking all characters in a steady stream of bindings.",
    "move.latexRain.effect.amount.crit": "4 × 10",
    "move.latexRain.effect.amount.graze": "2 × 10",
    "move.latexRain.effect.amount.hit": "3 × 10",
    "move.latexRain.narrative.miss": "{actor} sprays latex everywhere, causing globs of latex to rain from the sky.  The party easily dodged the falling globs of latex.",
    "move.latexRain.narrative.graze": "{actor} sprays latex everywhere, causing globs of latex to rain from the sky.  The rain hit {targets} in several places.",
    "move.latexRain.narrative.hit": "{actor} sprays latex everywhere, causing globs of latex to rain from the sky.  The rain nearly covered {targets} in bits of latex!",
    "move.latexRain.narrative.crit": "{actor} sprays latex everywhere, causing globs of latex to rain from the sky.  The rain soaks {targets} completely!",

    "buff.extraSprayers.name": "Extra Sprayers",

    // Queen
    "entity.queen.name": "Skunk Queen",
    "entity.empress.name": "Skunk Empress",
    "entity.goddess.name": "Skunk Goddess",
    "entity.queen.desc": "A girl obsessed with latex skunks, she is their creator! She wishes to turn every girl in the world into a cute skunk and rule over them as their queen!",
    "entity.queen.rules": "Crossing the 80%, 60%, 40%, or 20% HP threshold triggers [moves:callReinforcements] on her next move.\nCrossing the two-thirds or one-third HP threshold triggers [moves:latexRainmaker] on her next move.\nEach threshold triggers only once. Encounter setup determines the next wave.",
    "entity.queen.strategy": "Uses [moves:skunkCollar] if it is available and no character already has a collar. The Queen targets whoever has dealt her the most damage so far in the encounter.\nUses [moves:skunkPerfume] if it is available, choosing randomly between its three effects. \nUses [moves:skunkGun] on a random character.",
    "entity.empress.desc": "This is the original creator of the latex skunk technology, unlike the usurper in the woods.",
    "entity.goddess.desc": "The Goddess of the Realms, here to offer the ultimate challenge after saving you from the Skunk Empress.",
    "difficulty.extreme.queen": "Uses Skunk Gun as an extra attack each turn below 50% HP.",
    "difficulty.mythic.queen": "Uses Skunk Gun as an extra attack each turn.",

    "move.skunkGun.name": "Skunk Gun",
    "move.skunkGun.desc": "The Queen's gun shoots compressed globs of latex at its targets. They explode and start to cover anything they hit on impact.",
    "move.skunkGun.narrative.miss": "The {actor} aims her gun at {targets}, but gun misfires, causing no effects.",
    "move.skunkGun.narrative.graze": "The {actor} shoots {targets} with her skunk gun hitting {hitLocation}.",
    "move.skunkGun.narrative.hit": "The {actor} shoots {targets} {hitLocation} with compressed latex bullets, which quickly spread latex where they land.",
    "move.skunkGun.narrative.crit": "The {actor} unloads her skunk gun on {targets} and the bullets expode {hitLocation}, instantly covering quite a bit of her in latex.",
    "move.skunkCollar.name": "Skunk Collar",
    "move.skunkCollar.desc": "This collar is specially made to turn girls into skunks! It will continuously cover its wearer in latex until she is a perfect skunk.",
    "move.skunkCollar.narrative.miss": "The {actor} tries to lock her collar around {targets}'s neck, but it turned out to be defective.",
    "move.skunkCollar.narrative.graze": "The {actor} buckles the skunk collar tightly around {targets}'s neck.",
    "move.skunkCollar.narrative.hit": "The {actor} padlocks the skunk collar tightly around {targets}'s neck.",
    "move.skunkCollar.narrative.crit": "The {actor} closes the skunk collar tightly around {targets}'s neck. It closes seamlessly and immediately starts covering her in latex!",
    "move.callReinforcements.name": "Call Reinforcements",
    "move.callReinforcements.desc": "The Skunk Queen never fights alone! You'll need to go through her creations to finish her for good! Summons increasingly powerful waves of enemy allies.",
    "move.callReinforcements.effect.spawn": "[enemies:skunkette] / [enemies:skunk] / [enemies:fairy]",
    "move.callReinforcements.narrative.action": "The Skunk Queen calls into the forest for help...",
    "move.latexRainmaker.name": "Construct Rainmaker",
    "move.latexRainmaker.desc": "The Skunk Queen is adept at static weapons as well as living constructs. Activates increasingly powerful contraptions to spray the party.",
    "move.latexRainmaker.effect.spawn": "[enemies:rainmaker]",
    "move.latexRainmaker.narrative.action": "The {actor} throws an orb to the ground which quickly unfolds itself into a device that starts spraying latex everywhere!",
    "move.skunkPerfume.name": "Skunk Perfume",
    "move.skunkPerfume.desc": "The Skunk Queen sprays her perfume, but it's a sweet, rubbery scent that makes those who smell it more attracted to skunks... Randomly applies one of two weakening perfumes or a regenerative perfume.",
    "move.skunkPerfume.effect.heal.note": "Heals damaged [enemies:skunkette], [enemies:skunk], and [enemies:fairy].",
    "move.skunkPerfume.narrative.action": "The {actor} sprays her skunk-scented perfume all over the place...",

    "buff.defensePerfume.name": "Defense Perfume",
    "buff.defensePerfume.narrative.miss": "{targets} ignore the perfume even though it smells bad.",
    "buff.defensePerfume.narrative.hit": "{targets} can't resist the urge and lower their defenses a bit in response.",
    "buff.escapePerfume.name": "Escape Perfume",
    "buff.escapePerfume.narrative.miss": "{targets} ignore the perfume even though it smells bad.",
    "buff.escapePerfume.narrative.hit": "{targets} can't resist the urge and start to feel like becoming a skunk wouldn't be so bad...",
    "buff.empressMight.name": "Empress's Might",
    "buff.goddessMight.name": "Goddess's Might",
    "buff.might.name": "Might",

    // Bindings
    "binding.latexHead.name": "Skunk Head",
    "binding.latexHead.short": "Head",
    "binding.latexHead.desc": "A latex snout that keeps its wearer quiet, as every good skunk should be.",
    "binding.latexHead.light": "A medium sized latex ball acts as a gag.",
    "binding.latexHead.moderate": "A large latex ball gag that includes a half mask covering your lower face.",
    "binding.latexHead.heavy": "A large plug-shaped latex gag, with a latex half-mask in the shape of a skunk snout. The helplessness you feel pacifies you a bit.",
    "binding.latexHead.severe": "A large plug-shaped latex gag, held in place with a full hood in the shape of a skunk head, leaving ony your eyes free. The helplessness you feel pacifies you a lot.",
    "binding.latexHead.overwhelming": "A large plug-shaped latex gag, inflated to form a perfect fit to the inside of your mouth. A full latex hood covers your face, clamping your mouth shut over the gag and leaving only your eyes free.",
    "binding.latexArms.name": "Skunk Arms",
    "binding.latexArms.short": "Arms",
    "binding.latexArms.desc": "Black latex skunk paws that aim to force their wearer onto her elbows.",
    "binding.latexArms.light": "Simple latex gloves reach up to your elbows.",
    "binding.latexArms.moderate": "Thick latex gloves make it hard to manipulate things, and grow up to your shoulders.",
    "binding.latexArms.heavy": "Thick latex paw-shaped gloves cover your hands, making it nearly impossible to use them normally.",
    "binding.latexArms.severe": "Latex gloves that fold themselves over, merging into half length skunk paws, and trapping your hands and arms uselessly against your shoulders.",
    "binding.latexArms.overwhelming": "Latex half-length skunk paws, trapping your hands and arms against your shoulders.  They're completely solid, and nearly inescapable.",
    "binding.latexTorso.name": "Skunk Torso",
    "binding.latexTorso.short": "Torso",
    "binding.latexTorso.desc": "A latex corset and vibrating tail that make it hard to stay still or focus on fighting.",
    "binding.latexTorso.light": "A latex corset starts to form across your torso, making it a little difficult to breathe.",
    "binding.latexTorso.moderate": "A latex corset that spreads to between your legs, starting to pleasure you even as the latex continues to trap you!",
    "binding.latexTorso.heavy": "A thick, tight latex corset, spreading from neck to crotch and teasing you between the legs, making it much more difficult to breathe or concentrate on escaping.",
    "binding.latexTorso.severe": "A latex corset that covers and nearly crushes your torso, making it nearly impossible to breathe.  A pair of dildos invade your nethers, keeping you on edge with every escape attempt.",
    "binding.latexTorso.overwhelming": "A thick latex corset, covering your torso from the neck down to the legs in an impenetrable grip. Twin dildos in your nethers roar to life, as an additional pair of vibrators starts right over your breasts.",
    "binding.latexLegs.name": "Skunk Legs",
    "binding.latexLegs.short": "Legs",
    "binding.latexLegs.desc": "Black latex skunk paws that aim to force their wearer onto her knees.",
    "binding.latexLegs.light": "Latex knee boots form around your feet.",
    "binding.latexLegs.moderate": "Thigh boots with 5 inch heels form around your feet, and straps buckle shut all the way up.",
    "binding.latexLegs.heavy": "Thigh high boots ending in skunk paws with a ballet heel built in! There are no closures to these custom formed boots.",
    "binding.latexLegs.severe": "Thigh high latex boots, folded over to become half length skunk paws, forcing you to crawl around on your knees!",
    "binding.latexLegs.overwhelming": "Thick latex boots bending your legs at the knee, making them into half-length skunk paws, leaving no chance to escape.",
    "binding.latexCollar.name": "Skunk Collar",
    "binding.latexCollar.short": "Collar",
    "binding.latexCollar.desc": "The Skunk Queen's masterpiece.  It continuously spreads latex to the rest of the wearer's body with the goal of creating the perfect skunk!",
    "binding.latexCollar.library": "Each tick adds 1/5 of the collar's amount, rounded up, to [bindings:latexHead], [bindings:latexArms], [bindings:latexTorso], and [bindings:latexLegs].\nThe collar does not use the body's normal escape-spreading or peak-restoration behavior.",
    "binding.latexCollar.light": "The collar is buckled loosely around your neck.",
    "binding.latexCollar.moderate": "The collar is buckled firmly around your neck.",
    "binding.latexCollar.heavy": "This taller collar has two buckles, and both are shut tightly.",
    "binding.latexCollar.severe": "This posture collar has a pair of padlocks dangling from the back of it, and is continuously spreading latex on your body.",
    "binding.latexCollar.overwhelming": "This collar completely restricts the movement of your neck, has no closures in sight, and glows with magic... or at least it would if you could see past the latex that is vigorously covering your body!",
    "binding.skunkBindings.desc": "Used by the Skunk Queen to create an army coated in shiny black latex.  Anyone covered in it will be controlled by it and follow the Skunk Queen's wishes.",
    "binding.skunkBindings.name": "Skunk Bindings",
    "binding.skunkBindings.restoration": "Skunk Bindings can be regenerated by [moves:latexRegeneration].\nRemoving a binding entirely resets its peak amount.",
    "binding.skunkBindings.spreading": "At Heavy and above, escaping from Skunk Bindings causes latex to spread to other body zones.\nThe amount of spread increases as the severity of the binding increases.\nAssists will spread latex onto the actor instead of the target.\nThe spread modifier increases the amount of binding that will be generated when spread happens, even if below Heavy",
    "binding.skunkBindings.transformation": "When all four body zones reach Overwhelming, the character becomes Incapacitated and converts into a hostile Skunkette.\nSkunk Queen will reclaim her collar from converted characters.\nDefeat the converted Skunkette to rescue the character, allowing them to reduce their bindings by half and rejoin the battle.",

    // Trap
    "trap.trapPuddle.name": "Latex Puddle",
    "trap.trapPuddle.desc": "A field hazard that consumes puddles to bind moving characters.",

    // Encounters
    "encounter.prologue.name": "Ko-chan's New Game",
    "encounter.prologue.desc": `"My Lady!  I found an interesting game!" Ko-chan bounded into the foyer of the dormitory excitedly.
    Matsuko looked up from some papers she was reviewing and smiled. "Found another way to ignore your work, did you?  What is this new game you found about?"
    "Hu hu. I found it at a used game store. It's one of *those* games, you see. It has multiplayer, so I thought we could all play together. You have to save some girls from an angry bondage maniac." Ko-chan hurriedly explained the game to Matsuko.
    Matsuko held the game in her hand and read the back of the case. "Hmm... Interesting enough, I guess. Let's see if the others want to try it."
    * * *
    "So, how do we play this?" Hinari spun the disc around her finger and pushed it into the gaming console.
    Ko-chan held up a pair of VR goggles. "Once you put on the goggles, you enter a battle and try to defeat the enemies before they can completely restrain you. If we work as a team, we should be able to free each other before things get out of hand."
    Sakari put on the goggles and sat down on a chair. "You don't need to convince me more. Let's give it a try."
    "Interest high. Evaluating cooperative potential." Naruyo seemed like she was already starting to develop her strategies.
    "Very well. We'll try it out for a while and see if it's worth a deeper look." Matsuko put on her own goggles and sat on the couch.
    Ko-chan pumped her arm and smiled. "I can't wait!  Hurry up and start, game!" She started the game and began to configure her character.`,

    "encounter.plains_1.name": "Ko-chan's First Fight",
    "encounter.plains_1.desc": `Ko-chan appeared outside a small town clad in a fancy white tutu, ballet boots, and long gloves. Behind her, a pair of fake wings clung to her back. She looked herself over and smiled. "It's perfect."
    "A whole character creator and you recreated the same outfit you wear every day?" Hinari scoffed a bit when she saw Ko-chan's costume.
    Naruyo spoke up for her. "Understands good workmanship. I approve."
    "Of course you approve, you made her costume in the first place!" Sakari ribbed back at her.
    "That's enough. She can pick whatever she wants and look just as cute, right?" Matsuko caused Ko-chan to blush with a single comment, as usual.
    Hinari looked around. "So what are we supposed to do anyhow?"
    "There's two quests in the log already. We can either go check a clearing nearby where some skunk sightings were reported, or we can do some information gathering in town." Ko-chan read from the system interface.
    Matsuko nodded. "Let's split up. Two of us can check around town, and the other three can go investigate that clearing."
    "Sounds good to me." The rest nodded as they agreed with the plan.
    * * *
    When they got to the clearing, they found a pair of girls already trapped on their elbows and knees in latex skunk suits. They were spraying down a third girl, who was quickly trapped and controlled by the magic latex bondage. The three skunks turned towards the party when they approached and immediately started to race towards them.`,

    "encounter.plains_1.victory": `As the skunkettes took more and more damage, their control over their victims faltered, allowing them to start to fight the control from the inside. Before they could be completely freed, however, their suits forced them to turn tail and run off towards the forest border.
    The party decided to chase them down and save those girls for good before they were forced to assault more people against their wills.`,

    "encounter.plains_1.defeat": `Just as the party thought they were done for, the skunkettes seemed to have lost interest and ran off somewhere else. Left alone and unattended, they started trying to free themselves from their bindings. Luckily for them, the skunkettes did the bare minimum to subdue them, and one of the party wasn't even fully covered, with patches of bare skin exposed on her arms and legs.
    After a lot of struggling and some scraping on nearby branches and trees, she was able to free one arm, and from there, free herself from the rest of the latex. "Ugh... That sucked."
    "Mmmmmm!"
    "Yeah, yeah, I know, just hold on for a minute alright?!"
    A few minutes later, all three were freed and ready for another shot at the mission.`,

    "encounter.plains_2.name": "Ko-chan's Trap",
    "encounter.plains_2.desc": `The party chased the skunkettes to the edge of the forest where they found them resting on the ground. Nearby, a pair of normal sized skunks were spraying them with latex, which patched up the gaps that had been created by the previous battle and restored them to full strength.
    When they noticed the party approaching, one of the three skunkettes ran off from the group while the other two got back to their "feet" and prepared to fight once more. The two smaller skunks wasted no time starting to spread liquid latex all over the area, causing the battlefield to become perilous quickly.
    "Ugh. Do they have to make it into a slip and slide out here?"
    "Careful, they're coming!"
    The party readied themselves for another battle with the skunk creatures.`,

    "encounter.plains_2.victory": `"Gross. It's getting everywhere."
    The last skunk exploded into liquid latex and at last, the scene was quiet. The girls trapped in the suits were freed, but unconscious, so they propped them up under a tree and looked around to see if they could find anything that would explain what was going on. Finally they found a trail of liquid latex leading to the north that was left by the skunkette that escaped.
    "I guess we should follow the trail?  Be wary of an attack though."
    The party followed the trail for some time, and eventually they found a wooden shack along the edge of the woods. As they approached, they heard a loud clang and a scream.`,

    "encounter.plains_2.defeat": `Despite their best efforts, the girls found themselves completely overwhelmed by the enemies they faced. The latex grew thicker and tighter around their bodies, until they could no longer resist. Trapped on their elbows and knees by the restrictive skunk suits, they could do nothing but wait until the other skunks lost interest in them.
    After confirming they were no longer being guarded, they made their way back towards the town. They struggled to keep their focus as the pair of dildoes vibrated furiously inside them. After several hours of crawling across the plains, they finally saw the town on the horizon.
    As they approached the town, they noticed something that made them reconsider their plans. The thick latex suits that held them helpless began to melt!  Without a collar to keep regenerating it, the living latex was losing its ability to hold its form. The girls started struggling fiercely against the latex, and at last, they were able to tear themselves free of their bondage!
    "Ugh, finally!"
    "Let's not do that again."
    "Why? I thought it was kind of fun..."
    Undeterred, they went back to the plains to begin searching again...`,

    "encounter.plains_3.name": "Skunk Queen's Manifesto",
    "encounter.plains_3.desc": `"Argh!  Where is it?!" The girl was hunched over a box, throwing things over her shoulder every few seconds. She noticed the party approaching and stood up, turning to face them.
    She was wearing an outfit made out of shiny latex, complete with a bunnysuit, tall boots, and long gloves. On her head was even a crown coated in black latex and reflecting the sun with its glossy sheen. "Oooh. Volunteers. My second favorite thing after skunks!"
    "Just who volunteered for anything? You must be related to the skunk creatures that have been running around everywhere lately, then?"
    "THEY! ARE! NOT CREATURES!  I have worked very hard to give birth to them, and I won't stand for you insulting them!" The girl pulled out the gun hanging from her belt and shot it at the party. They were able to dodge, but the glob of latex coated a nearby tree with a wide band of latex that quickly grew in both directions.
    "I'll turn you all into skunks and make you respect the name of the Skunk Queen! You'll realize the sheer genius of my inventions!" The Skunk Queen reloaded her gun and aimed it at the party again.
    "I guess diplomacy was never an option, then?  Let's get this over with."`,

    "encounter.plains_3.victory": `The Skunk Queen staggered away and fell to the ground, the broken bits of her inventions all around her, and the destroyed remains of her skunk creations strewn around the area.
    "That's impossible... I can't lose!" Without another word, she jumped to her feet and started running.
    "Just give up already. You lost and it's time to face the music." The party gave chase, but the Skunk Queen was quite fast. Even after a minute or two they were not catching up to her. The chase was cut off when the Skunk Queen stopped suddenly. Across from her were two people standing in her way.
    "Right where the reports said you would come. Good job chasing her here." One of the two people spoke up. When they got a good view, the party noticed that it was the two of them that had split off to ask around town.
    "So... you teamed up to corner me, huh?  But don't think you've won just yet! TAKE THIS!" She threw some device on the ground in front of her, and it exploded into a giant wave of latex! The party was thoroughly covered in the latex, which spread to cover their entire bodies! The latex formed mitten paws on their hands, and they were forced onto their toes as the latex formed paws on their feet too.
    "...What th-----hghmmmph" The party's cries were forcibly muffled by the latex filling their mouths and forming new skunk snouts, while tails sprouted from their behinds that were linked to pairs of vibrators.
    The Skunk Queen laughed maniacally as she watched the results of her handiwork. She turned around and noticed the party's state before frowning. "Damn, you didn't get fully skunked... Was the device defective, or were there just too many of you?  Either way, I'll get you next time! You'll never take me alive, heathens!!" She turned and bolted for the forest, and with their newly mittened hands and high heeled feet, the party was in no shape to give chase.
    They reconvened with the other two girls, but they were all in the same shiny condition. Despite their struggles, they were unable to make any headway on their bondage and were stuck quite securely.
    With no way to escape on their own, all they could do was return to town to report their failure and to try and find someone to help them out of their bondage...`,

    "encounter.plains_3.defeat": `The Skunk Queen laughed as she looked down at the three skunked girls in front of her. "I knew you'd make good volunteers. Very cute indeed."
    The party whined as they lay on the floor defeated. "Hmmnph...."
    "Now here's your first mission as my newest subordinates. Go forth and capture me more volunteers! I don't care who, as long as they're cute!"
    The Skunk Queen made exaggerated arm movements like she was commanding a vast army of soldiers, even though it was just the three of them.
    Lacking any better options and not wanting to linger near this insane girl any longer, the party made their way towards the town to look for help.
    Like before, when they got far enough from the forest the latex started to lose its shape and became easier to escape from. It didn't take long for them to free themselves from their bondage. Or at least, two of them did. 
    "MMMmmm---!" The girl that was unfortunate enough to still be wearing the Skunk Queen's collar was still completely stuck, and her skunk suit showed no signs of losing its structure or integrity.
    "So... the collar keeps the suit from falling apart? That's good to know."
    "Good thing she only had one of those things, or else we'd really be in trouble."
    "Mmmm!  Nnnmmm!" The last girl got annoyed that no one was helping her and started to struggle more vigorously.
    "Chill out~  We'll free you in a minute~ Right after I admire the view a little more..." After a bit more teasing they freed their friend and started to strategize about how they would avoid getting captured next time they confronted the Skunk Queen.`,

    "encounter.interlude_1.name": "Ko-chan's Frustration",
    "encounter.interlude_1.desc": `The party suffered greatly in the aftermath of their failure. The latex suits they were trapped in confined their ability to communicate, and the regenerative power of the latex confounded any attempts to cut them free. On top of that, they were banned from the guild for letting the Skunk Queen escape.
    With the guild's decree, none of the rest of the townsfolk would help the girls, leaving them trapped without hope for escape. After a fruitless day or two of trying to get someone to help them, a mage that lived nearby heard about their plight and offered to help.
    "What a predicament you girls are in. I can help, but it's going to cost you dearly. You girls now work for me, understand?"
    Having run out of options, the party had no choice but to submit. They obediently allowed the mage to lock slave collars around their necks. After all five girls were locked in, the mage dispelled the latex suits with surprising ease.
    "What....How?" Ko-chan immediately questioned the mage's abilities.
    The mage smirked. "Why so surprised? I created the Latex Magic in the first place as a way to capture fugitives. That girl that calls herself the 'Skunk Queen' stole my magical equipment and ran off with it to start abducting girls and making minions."
    Matsuko crossed her arms. "So... you created this problem, why aren't you the one solving it?"
    "She stole all of the prototypes I made, how do you want me to stop her?  For example, the Latex Bomb she used on you girls contains magic-infused latex, which is why your suits regenerated on their own. I can't stand her using my research like this!" The mage seemed incensed.
    "Ugh... So what do we have to do?  And why do we have to wear collars to do it?" Hinari seemed annoyed at this point.
    The mage gave a menacing glare. "This is where you girls come in. If you ever want those collars off you better get your asses out there and bring me that bitch. And she had better be properly humbled."
    Sakari laughed. "So.. that's how it is then?  Seems like we have no choice then. Let's get going."
    "Not so fast. Two of you have to stay behind to make sure the other three are properly... motivated." She snapped her fingers and two of the party were instantly skunked onto their elbows and knees.
    "The rest of you had better get a move on. Even if you fail, come back here and I'll give you another chance... after some light reeducation." The mage laughed and sent the remaining girls out of her tower.`,

    "encounter.forest_1.name": "Ko-chan's Ambush",
    "encounter.forest_1.desc": `The party set off for the forest to try and capture the Skunk Queen for good. They didn't see a single latex creature out on the plains, making them wonder if they had retreated to the forest to protect their creator. As they entered the forest, an unsettling feeling washed over them.
    "...Something is definitely watching us."
    "Unsurprising, considering we are infringing on their territory now."
    "Keep an eye out. We could be attacked at any time."
    The party advanced slowly through the forest until they got to a small clearing. Looking around, they found a burnt-out fire, and some remains of camping gear.
    "Look at this!  There's latex on this ruined tent!"
    As the party took a closer look, they failed to keep watch around them, and before they knew it, they were surrounded by skunkettes and a strange fairy creature, who wasted no time in ambushing them!`,

    "encounter.forest_1.victory": `As the last skunkette fell, one of the girls immediately threw up her arms.
    "Literally seconds after I said to keep an eye out--"
    "Yes, yes, we know. We're okay, aren't we? Let's just move on."
    "...Fine! Let's just not get ambushed again..."
    The party quickly moved on from the campsite deeper into the forest.`,

    "encounter.forest_1.defeat": `Yet again, the girls found themselves completely skunked and trapped on their elbows and knees, but this time, their enemies had a new trick to play on them. While struggling to escape from the various skunk creatures, one of the tiny fairies cast a spell on the party's bindings. The magic spell spread across their suits when it landed, leaving behind green runic lines and formations.
    After seeing the magic land successfully, the skunks did not chase them further, leaving the party to worry about the effects of the spell. None of them were wearing the Queen's skunk collars this time, so they expected that all they had to do was crawl far enough away from the forest to be able to escape. Even when they had almost made it back to town, though, their skunk suits were still strong and unyielding.
    "MMmnnmm..." One of the girls shook her head, trying to somehow spit out the huge chunk of rubber filling her mouth, but it was as useless as the last time she tried it.
    Despite their situation, they still weren't desperate enough to ask for help from the townsfolk considering their previous experience, so they hid out in an alley trying to use various exposed nails and rough wooden edges to cut through their bondage and escape.
    It was a slow and grinding process, but eventually they were able to wear down the magic and tear themselves free of the suits.
    "...That magic is trouble."
    "Yeah. It extended the durability of the bondage quite a lot... We should be careful going forward."`,

    "encounter.forest_2.name": "Ko-chan's Quagmire",
    "encounter.forest_2.desc": `The further they went into the forest, the more latex they started to see. Tree trunks were covered, bushes were dripping, and puddles covered the ground. It started to get rather dangerous to move around without stepping in the latex.
    "Just who would do something like this..."
    They reached another clearing, but its contents were nothing like what they were expecting. Before them stretched a vast swamp of latex. When they entered the clearing they were immediately noticed by some skunks that were busy 'repairing' the damage on a pair of skunkettes. Two of those fairy creatures were nearby as well.`,

    "encounter.forest_2.victory": `Finally, they defeated the largest group of the skunk creatures yet. After moving the rescued girls to a dry patch of ground, they looked around to try and find the path forward again.
    "Just how many of these things are there?"
    "She's certainly been busy in the time we spent trying to get free..."
    "Let's hurry up and find her so we can get out of here."
    After a while, they found something of a trail leading deeper into the woods and started to follow it.`,

    "encounter.forest_2.defeat": `Before they managed to escape from their pursuers, the two fairies teamed up to enchant the party's skunk suits, leaving them covered in dense magical runes. They had a feeling that escape would be a serious problem this time. They made their way slowly back to town while trying to ignore the vibrators, but this time they found that not even exposed nails could do any damage to the magically enhanced suits.
    They didn't know what the 'reeducation' the mage threatened was, but none of them wanted to find out, so they would exhaust all possibilities before going back to the mage's tower. After admitting defeat with the nails and rubble, they decided to try and see if they could get some of the townspeople to help. They went out onto the street and looked for anyone who seemed handy with tools.
    "More skunk girls?  We've been seeing more and more lately..."
    "I don't know what you want me to do, girls. Do I look like a mage or something?"
    After most of a day of fruitless searching, they found success at last. The local blacksmith was able to use her artifact disenchanting tools to break them out of their suits.
    "Thank you very much, miss. We had no way to free ourselves from those suits."
    "It's no problem. Even if the guild says not to help you, I couldn't bear to watch you three crawl around the town forever.  Come back if you need more help, and I hope you are able to get to the bottom of this menace."
    The girls gave a bow before leaving to rethink their battle strategies once more.`,

    "encounter.forest_3.name": "Skunk Queen's Empire",
    "encounter.forest_3.desc": `After a few hours of wandering the forest, the party reached the deepest part. By this point, there wasn't a single piece of foliage around that wasn't covered in shiny latex. The latex-coated trees thinned, revealing a clearing where the Skunk Queen was sitting on a makeshift throne of latex-covered branches and rocks. On either side sat a skunkette with a glittering collar, and a skunk fairy fluttered around like a loyal attendant.
    "We meet again, my dear volunteers. I am so glad you are so eager to become my pets!"
    "I'll make you pay for the humiliation I've suffered!"
    "I see you managed to escape the suits I gave you girls. How disappointing. Well, don't worry, I'll make sure you don't escape them this time."
    "Enough talk! Prepare to meet your maker!"
    "As you wish. I've got the perfect place for all of you in my new empire of skunks! Have at you!"`,

    "encounter.forest_3.victory": `After a grueling battle, an unblocked hit to the side sent the Skunk Queen sprawling to the ground. She hit the ground hard, her gun spinning away on the latex-coated ground. Before she could scramble over to it, a knee pressed into her back...
    "Not so fast, your highness." One of the girls put more weight onto the Skunk Queen's back, making her groan and struggle in pain.
    "G-get off me, you bitch!" The Skunk Queen struggled more vigorously before her head was pressed into the ground as well.
    "I've been wanting to do this for a long time now." One of the party approached with the Skunk Gun and turned it up to its maximum level. She aimed carefully at the Skunk Queen as she begged for mercy, and just before she fired, the one holding the Skunk Queen down stepped back. Huge globs of latex were fired by the gun, which collided directly with the Skunk Queen's head and back.
    She kept shooting as the latex quickly spread over the struggling girl's body, and before long, she was heavily suited in the shiny latex. Eventually, a dull click indicated that the gun was empty, and she stood down.
    "That should be enough. Let's finish this up, then."
    The discarded Skunk Collar was fitted around the Skunk Queen's neck. It closed seamlessly with a dull click, and glowed brightly with magic, causing green lines to spread over the surface of the latex skunk suit. The Skunk Queen could only whine and struggle weakly.
    "Good work. Let's get her back to the mage so we can get out of our own collars."
    All three girls nodded and made their way out of the latex forest with their target in hand.`,

    "encounter.forest_3.defeat": `"I knew you'd be back, and I knew you'd lose again. I realized my mistake after you got free last time, you see."  The Skunk Queen wasted no time after incapacitating the party to start making more speeches.
    "Mmmmm!~~"  One of the girls tried to squirm away, only to be pressed down by a latex heel.
    "Don't go anywhere until I'm done, hear me?  So I made a mistake, you see. I know my collars are effective at preventing escape, but I only had enough to collar one of you three last time, which is why you managed to escape and come back to find me again. This time, I won't make the same mistake. I've got one for each of you, and I've even upgraded their locking mechanisms just for you girls. I think you'll find it much more difficult to get rid of this time."
    She finally finished her speech and proceeded to lock tall posture collars around each of the party's necks. The collars thickened and spread the latex even more vigorously than previous versions, which gave them a sinking feeling. "Now, go and spread my name across the lands of my future Skunk Empire!  I hope you won't betray me again, because that would make me very sad."
    This trip back to the town was even more stimulating than the ones before it, with more vibrators inside the suits on their chest in addition to the usual ones. Worse, when they got to the blacksmith's shop they found a sign on the door that said 'Shop closed -- Off finding new materials'. With all of their other options closed off, they had no choice but to go back and see the mage.
    "Oh, look at this... My pets got all dressed up for me!  How did you know my favorite outfit?"
    "NNnnnnmmmm....."  One of the party tried to disagree, but the mage ignored her.
    "I promised you girls some reeducation, so I hope you're ready for a long night~~"
    The next morning, all five girls lay on the ground exhausted from a night of 'playtime' with the mage. One of them weakly struggled, but the collar and suit still held tightly, and so she did nothing but elicit a smile from the mage.
    "Good morning, girls. I hope you had fun last night!  As promised, I'll release you guys from your bondage now."
    The mage snapped her fingers and the latex restraining three of the girls melted away to nothingness, leaving them stark naked other than their slave collars. The girls staggered to their feet, covering themselves as they continued to blush from their arousal.
    "You plan to make us go back out naked?"
    "Only if you want to, dear~  I'm sure you'll figure something out otherwise."
    The party gritted their teeth, but didn't argue further, knowing they would only invite the mage to mess with them further. After borrowing some clothes from a kindly townsperson, they assembled to discuss where they went wrong when confronting the Skunk Queen.`,

    "encounter.interlude_2.name": "Ko-chan's Triumph",
    "encounter.interlude_2.desc": `The party brought all of the Skunk Queen's gadgets with them as they made their way out of the forest. It was slow going, because the Skunk Queen fought them every step of the way.
    Finally, they made it back to the tower and met an incredulous mage at the entrance.
    "Wow, I'm impressed. I didn't think that you all would actually succeed... Let's get her inside."
    The mage helped bring the Skunk Queen back to her laboratory. After she paralyzed the Skunk Queen with a spell, it was much easier to move her up the stairs. Once the group reached the top floor, the mage turned back to them.
    "You even brought back the inventions she stole! I can't tell you how helpful this is to me."
    "This is all well and good, but now can you please fulfill your side of the deal?"
    "What do you mean by that?"`,

    "encounter.tower_1.name": "Skunk Empress's Scheme",
    "encounter.tower_1.desc": `"You promised to remove our collars and release our friends if we captured the Skunk Queen. Please do so."
    "I think you misunderstand. This girl is no queen. Maybe a queen of skunkettes."
    The mage caressed the skunked girl as she whimpered softly, before turning back to the party, grinning evilly.
    "If you want the REAL Skunk Queen, then you probably mean.... me!"
    As she said this, power began to surround her. Her robes disintegrated and latex gear materialized around her body. She wore the same bunny suit, gloves, and boots ensemble that the other girl had worn, but her much curvier body and larger bust filled out the costume in ways that the other girl could never dream of.
    "It was you?!?  Then that means..."
    "That's right. I was in a heap of trouble when this wretched girl ran off with my inventions and staged her rebellion in the forest. But now that I have them back... I think a new title is in order. Behold, the Skunk Empress!!!"
    The magic in the skunked girl's collar turned red, and she took up a hostile pose, even if her eyes seemed reluctant. The mage finished reloading the gun and snapped her fingers. The girls gasped as the collars they were wearing began to spread latex onto their bodies. Before they had any time to react, the Skunk Empress had already fired the first salvo, and the skunked girl was aiming to pounce!`,

    "encounter.tower_1.victory": `"W-W-W-What?!  T-T-That's impossible..." The Skunk Empress fell to the ground, surrounded by broken pieces of latex creatures and her costume in tatters. She watched in disbelief as the party freed their friends and surrounded her.
    "I had every advantage... How did this happen..." The Skunk Empress muttered to herself.
    Ko-chan smiled. "Well, you see, we're a bit good at this escaping thing."
    Matsuko snorted from the side. "Well, at least some of us are."
    "Less talking, more binding. Don't allow another escape." Naruyo ordered grimly.`,

    "encounter.tower_1.defeat": `As expected, the Skunk Empress put the finishing touches on the last of the girls. With a satisfied pat, she pushed all five girls to the center of the room.
    "Foolish to think you had a chance to defeat me. Now let me show you a new trick I've been working on."
    She gathered some magic and shot it at the skunked girls. As the magic was absorbed into the latex, it grew warm, then hot!  The girls struggled and moaned as the heat was extremely uncomfortable, but it faded after a minute or so. The high gloss of the skunk suits was replaced with a dull matte finish after the heat had completely disappeared.
    The girls tried to struggle, but found that the formerly stretchy latex had turned into tough rubber with almost no give whatsoever. It also shrank considerably, revealing every one of their curves.
    "This heat sealing treatment makes the latex much, much stronger and less flexible. It's nearly impossible to cut, and it has even stronger regeneration abilities. You girls shouldn't lose hope though, those collars will lose their magic in just a few hundred years!"
    The girls fell into despair as they helplessly struggled against their bondage. Looking over, they realized that even the former Skunk Queen wasn't able to avoid the heat treatment. If she wasn't even going to let her subordinate off, who could be safe from her? All they could hear was the Skunk Empress's insane laughter as she turned to a map of the kingdom.
    After a few minutes, when Ko-chan was about to give up all hope of ever escaping, the world around her stopped completely!  She looked around the room, trying to figure out what had just happened... In front of her, a beautiful girl in revealing silver armor faded into existence.
    "Wow, you're really in trouble!  You girls sure surprised me with how often you can get yourselves into trouble~  Hey, why are you looking at me like that?  I'm here to help you, you know?  I'm the Goddess of the Realm, savior of cute little adventurers like you!"
    The girl puffed up her cheeks in an exaggerated show of annoyance. She kneeled down and tapped Ko-chan on the snout. "Would you like some help, little girl?"
    Ko-chan nodded quickly, expectantly... The Goddess giggled as she stood up and snapped her fingers. Time itself rewound to before the fight started, and the Goddess gave a wink as she cast some spells on the mage and the former Skunk Queen.
    "I'll give you a second chance to try and win.  As a bonus, I've weakened your opponents a little~  If you fail a second time, I'll help you even more!"
    Time suddenly restarted just in time to hear the Skunk Empress's reply.
    "What do you mean by that?"`,

    "encounter.tower_2.name": "Goddess's Assistance",
    "encounter.tower_2.desc": `"Enough! I know how this will end." The party didn't wait for the mage's speech or grand reveal and simply attacked from the start.
    The mage was surprised, but she regained her composure and transformed her robes into the Skunk Empress's outfit in an instant.
    "I don't know how you saw through my deception, but good job. Too bad it won't change the outcome!"
    She drew her weapon and attacked the party.`,

    "encounter.tower_2.victory": `"W-w-w-hat?!?"
    The Skunk Empress was knocked backwards into her desk, and grimaced in pain as the edge pressed into her back like a knife. She landed on the ground groaning and squirming, grasping her back. They wasted no time pressing their advantage and twisting her arms behind her back.
    "OW! GET OFF ME THAT HURTS!"
    "Good. Let's make it hurt more."
    The party released their friends and started to look around the room for a way to restrain the Skunk Empress.`,

    "encounter.tower_2.defeat": `Yet again, the party found themselves helplessly skunked at the Empress's feet.  Time paused again for Ko-chan, and the Goddess appeared before her like before.
    "You have the most talent at getting hopelessly bound that I have ever seen.  Not that I'm complaining, you make quite a cute skunk!"
    "Don't worry, though.  I've got another chance to give you!  And I'll make your fight even easier than last time~  What a deal!"
    Time itself rewound again to before the fight started, and the party readied itself for another attempt.
    Time restarted, and they heard the now familiar reply of the Skunk Empress.
    "What do you mean by that?"`,

    "encounter.tower_3.name": "Goddess's Resurgence",
    "encounter.tower_3.desc": `Right as the mage was about to start her speech, the party erupted with divine power, stunning the mage for a second. They started their attack before the mage could even react, getting a free swing in the process.
    "I've had enough of this, won't you please just lie down and get defeated already?!" One of the party vented her frustration at having to repeat the same battle multiple times as she attacked.`,

    "encounter.tower_3.victory": `Eventually, the Skunk Empress found herself laid out on the ground with several unnaturally strong girls pressing her body to the ground. "What... just happened?!"
    "It seems that even the gods of this world want to see you defeated, that's what."
    "Quit gloating and let's finish the job already."
    They quickly freed their friends and looked around the room.`,

    "encounter.tower_3.defeat": `The Goddess stood over the helpless Ko-chan and crouched down. "Hey. Are you doing this on purpose?  It's clear that you like getting caught and bound, but aren't you taking it a little too far?"
    Ko-chan looked up at the Goddess, but since the Goddess did not remove her gag, she was unable to give any sort of reply.
    "Don't get me wrong, I'm having a great time watching you get steamrolled by the Skunk Empress over and over, but think of your friends.  How many times are you going to make them lose like this?  Maybe you should try a little harder next time for their sake?  You do want to finish this game someday, right?"
    Ko-chan grunted and nodded at the Goddess's admonishment and prepared herself for another attempt.
    The Goddess laughed.  "Well, I say all that, but I'm not gonna let you win for free, so I'm not gonna give you any more bonuses than what I've given you so far from here on out.  You'll just have to win by being the better team, instead of waiting for me to make you super powerful."
    She snapped her fingers and time rewound once more to the start of the fight, then resumed like before.`,

    "encounter.interlude_3.name": "Skunk Empress's Punishment",
    "encounter.interlude_3.desc": `Sakari investigated some of the devices in the room. "This thing looks interesting, let's shove her in here~"
    The Skunk Empress struggled and fought as she saw what Sakari was referring to, but Matsuko was easily strong enough to keep her resistance to a minimum. She forced her into the large clear tube device and slammed the door shut.
    "He he, I'll take it from here, My Lady." Ko-chan smiled cheerfully as she manipulated various levers and knobs. She finally pulled a large red lever and the machine engaged.
    The machine sputtered to life, and inside the tube, large sprayers began spraying latex onto the Skunk Empress from all directions. Her yelling and cursing were quieted as her mouth was filled with the latex, and she was forced down to the ground as her arms and legs folded over and merged together. The machine shut off, leaving a securely skunked Skunk Empress struggling in the tube.
    Hinari watched the Skunk Empress get encased just like they had been earlier. "You look good like this. But I think we can do better. Give her another round, Ko-chan!"
    "You think so?  Alright." Ko-chan engaged the machine again and watched as the sprayers turned back on. This time when the machine shut off, the Skunk Empress was stuck in considerably thicker and tighter latex, and you could see her curves clearly all over her body. Her eyes reflected her despair as she realized there was no point in struggling further.
    Matsuko smiled as she put her hand on the tube. "I think the next part needed a bit of heat?" She conjured some white flames which raised the internal temperature of the tube enough to start the heat sealing process.
    A few minutes later, the heat sealing cycle finished, leaving the Skunk Empress with a dull matte finish. Matsuko opened the door and dragged her out of the tube before locking a collar around her neck. The collar glowed green and drew lines in the shape of a harness onto her suit, sealing the suit even more securely.
    "Final step. Use these." Naruyo carried over a pair of transparent shells in the shape of skunks and placed them on the ground. 
    Immediately upon seeing them, Ko-chan's eyes flashed as she realized what they were for. "...Wow...these...are...amazing! Let's use them right away!"
    Hinari came over and helped open the top of the shells. "From the way these clips work, if you close them with someone inside, I don't think it will be possible to open them again."
    Sakari shrugged and looked over at the Skunk Empress. "Not my problem. She should have thought of that before she tried to take over the kingdom. Now, in you go."
    Between the girls, they managed to force the violently struggling Skunk Empress into the bottom half of the shell, and then close the top half over it. With a series of clicks, the shell closed and sealed the Empress into an impenetrable, form-fitting transparent shell. They repeated the process on the former Skunk Queen with the other shell before looking back at each other.
    Matsuko clapped her hands together. "Mission accomplished. Let's get out of here and see what the reward for solving the mystery is."
    The rest of the girls looked around and nodded to each other. "We are all in agreement then. Let us turn in the quest and move on."`,

    "encounter.epilogue.name": "Ko-chan's Review",
    "encounter.epilogue.desc": `After turning the Skunk Queen and Empress into the guild and each receiving a medal, they watched the credits roll and then the VR goggles disengaged.
    Ko-chan put her goggles on the table and stood up, stretching a bit. "That was great!  I had so much fun!"
    Matsuko patted her head a bit. "Maybe next time you'll try escaping sometime instead of making us free you from whatever trouble you get into?"
    "She does that in real life too, why do you think it would be different in a game?" Hinari laughed as she replied.
    Ko-chan stomped her foot. "Hey! Come on, I helped!"
    "Very useful. Godly power unleashed. Sadly, only in game." Naruyo consoled Ko-chan a bit.
    Sakari read the back of the game case. "So... Was there really only that one scenario in it?"
    Ko-chan put a finger on her chin. "Apparently they only made one scenario so far. I guess they're waiting to see if people like it before making more."
    "Ah... So maybe if we send them our thoughts, they might make a second mission? What could even top this one?" Hinari mused to herself.
    "Who knows. Maybe a castle scenario could be fun?" Matsuko threw out her suggestion.
    "Hey, don't get my hopes up guys!" Ko-chan seemed annoyed by the flow of the conversation. "Did you see that last option before we exited though? Apparently there's a secret battle that's super hard. We should give it a try sometime."
    "Sure, I don't mind. Just let me know when." Sakari agreed to the proposal and the rest of the girls started to look forward to their next game day.`,

    "encounter.outside.name": "Goddess's Trial",
    "encounter.outside.desc": `The Goddess of the Realm appeared before the party once more. "Oh, isn't this embarrassing. I was sure that last fight would be enough to satisfy you. Well, I hate to disappoint."
    "Beware though: All I can promise you is a swift defeat. Absolutely no help whatsoever. And just so you know, there's no prize for winning either."
    The Goddess of the Realm dissolved her own armor and conjured the Skunk Empress's outfit instead. Next to her appeared the Skunk Queen and the Skunk Empress, ready to take their revenge!
    "Any time you like, dear. Or you can always wimp out if you're scared~"`,

    "encounter.outside.victory": `The Goddess found herself defeated, but didn't seem worried. She vanished out from under the party and appeared back in front of them, floating softly.
    "A well-fought battle. You truly are touched by the gods. I have nothing more for you, though. Come back for a rematch anytime."`,

    "encounter.outside.defeat": `The party found themselves humiliated yet again by the Goddess.
    "You didn't think this would end differently, did you?  I do like your tenacity, though.  You may try any number of times, but I won't go easy on you for even a second!"`,
};

