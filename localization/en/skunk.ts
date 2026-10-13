import { StringTable } from "../../src/ui/presentation/presentation";

export const skunkEnglishStrings: StringTable = {
    "entity.skunkette.generic": "Skunkette",
    "entity.skunkette.name": "Skunkette {index}",
    "entity.skunk.generic": "Skunk",
    "entity.skunk.name": "Skunk {index}",
    "entity.fairy.generic": "Fairy",
    "entity.fairy.name": "Fairy {index}",
    "entity.rainmaker.generic": "Rainmaker",
    "entity.rainmaker.name": "Rainmaker {index}",

    "entity.queen.name": "Skunk Queen",
    "entity.empress.name": "Skunk Empress",
    "entity.goddess.name": "Skunk Goddess",

    "entity.skunketteQueen.name": "Skunkette Queen",
    "entity.skunkEmpress.name": "Skunk Empress",

    "entity.skunketteKo.name": "Skunkette Ko",
    "entity.skunketteMatsuko.name": "Skunkette Matsuko",
    "entity.skunketteHinari.name": "Skunkette Hinari",

    "entity.skunkette.desc": "An unfortunate girl that has been trapped on her elbows and knees by a suit of living latex. The latex itself controls her body, and she can only watch on as she assaults anyone nearby, trying to create more skunks.",
    "entity.skunkette.rules": "Below 40% HP, the Skunkette suffers Potency −4 and Defense −1.\nEach time the Skunkette takes damage, [moves:pounce] loses one severity level. \nDefeating a Skunked character frees them from the latex's control and halves their bindings.",
    "entity.skunkette.strategy": "If currently pouncing a character, the Skunkette uses [moves:latexSpray] on that character.\nOtherwise, if [moves:pounce] is available, it chooses a random valid character who is not already pounced.\nOtherwise, it chooses [moves:latexMist] or [moves:latexSpray] with equal probability. Spray targets a random valid character and body-zone binding, while Mist hits all characters.",
    "entity.skunk.desc": "A cute forest animal... with a high gloss sheen. It sprays latex on anything that threatens it, and it covers the area in puddles!",
    "entity.skunk.rules": "When it falls below 20%, it changes its next move to [moves:latexExplosion] against the attacker.",
    "entity.skunk.strategy": "Below 20% HP, the Skunk uses [moves:latexExplosion] against the most bound character. If nobody is bound, it chooses a random valid character.\nIt may use [moves:latexPuddle] to replenish the arena's puddles. This is more likely when there are less puddles present.\nIt may use [moves:latexRegeneration] on the character with the most potential regeneration. This becomes more likely as the potential regeneration grows.\nUses [moves:latexShower] on a random valid character and location.",
    "entity.fairy.desc": "A tiny skunk with fairy wings. Just what kind of experiment created this being?",
    "entity.fairy.strategy": "The Fairy chooses one of three support actions: healing Skunkettes or Skunks with [moves:healingMagic], shield an ally using [moves:barrierMagic], or strengthen an ally with [moves:empoweringMagic].\nIf there are no valid support targets, it uses [moves:bindingMagic] on a random valid character.",
    "entity.rainmaker.desc": "A creation of an insane genius. It sprays latex everywhere, covering everyone in the vicinity!",
    "entity.rainmaker.strategy": "Uses [moves:latexRain] every turn against the entire party.",
    "entity.queen.desc": "A girl obsessed with latex skunks, she is their creator! She wishes to turn every girl in the world into a cute skunk and rule over them as their queen!",
    "entity.queen.rules": "Crossing the 80%, 60%, 40%, or 20% HP threshold triggers [moves:callReinforcements] on her next move.\nCrossing the two-thirds or one-third HP threshold triggers [moves:latexRainmaker] on her next move.\nEach threshold triggers only once. Encounter setup determines the next wave.",
    "entity.queen.strategy": "Uses [moves:skunkCollar] if it is available and no character already has a collar. The Queen targets whoever has dealt her the most damage so far in the encounter.\nUses [moves:skunkPerfume] if it is available, choosing randomly between its three effects. \nUses [moves:skunkGun] on a random character.",
    "entity.empress.desc": "This is the original creator of the latex skunk technology, unlike the usurper in the woods.",
    "entity.goddess.desc": "The Goddess of the Realms, here to offer the ultimate challenge after saving you from the Skunk Empress.",
    "entity.skunketteQueen.desc": "The former Skunk Queen, reduced to a minion after her failure.",
    "entity.skunkEmpress.desc": "The former Skunk Empress, reduced to a minion after her failure.",

    "difficulty.extreme.skunkette": "Gets a followup Latex Spray on strong hits as well as criticals.",
    "difficulty.extreme.skunk": "Survives Latex Explosion when it hits a target.",
    "difficulty.extreme.fairy": "Has a 50% chance to use Binding Magic as an extra attack each turn.",
    "difficulty.extreme.queen": "Uses Skunk Gun as an extra attack each turn below 50% HP.",
    "difficulty.extreme.rainmaker": "Explodes into 50 Latex Puddles when defeated.",
    "difficulty.mythic.skunkette": "Gets a followup Latex Spray on any hit.",
    "difficulty.mythic.skunk": "Survives Latex Explosion whether it hits or misses.",
    "difficulty.mythic.fairy": "Uses Binding Magic as an extra attack each turn.",
    "difficulty.mythic.queen": "Uses Skunk Gun as an extra attack each turn.",
    "difficulty.mythic.rainmaker": "Explodes into 100 Latex Puddles when defeated.",

    "buff.ambushed.name": "Ambushed!",
    "buff.collar.name": "Slave Collar",

    // Skunkette
    "move.latexSpray.name": "Latex Spray",
    "move.latexSpray.desc": "Spray living latex onto an opponent.",
    "move.pounce.name": "Pounce",
    "move.pounce.desc": "Pin a victim, with stronger restrictions or even follow-up attacks at higher severity.  Grip deteriorates with damage taken.",
    "move.pounce.effect.spray": "[moves:latexSpray]",
    "move.latexMist.name": "Latex Mist",
    "move.latexMist.desc": "This black mist causes Skunk Bindings to become more active and grow on their own.",
    "move.latexMist.effect.onCrit": "All existing bindings",
    "move.latexMist.effect.onHit": "One existing binding",
    "move.latexMist.effect.spread.note": "Spread modifier is random between +1 and +5.",
    "move.throwOff.name": "Throw Off",
    "move.throwOff.desc": "Try to throw a pouncing Skunkette off of you!",
    "move.throwOff.effect.cooldown": "[moves:pounce] · 2 rounds",
    "move.throwOff.source": "[enemies:skunkette]",

    "buff.pounce.name": "Pounce",
    "buff.pounce.allow": "Adds Throw Off",
    "buff.latexMist.name": "Latex Mist",
    "buff.resistance.name": "Victim Resistance",
    "buff.skunked.name": "Fully Skunked",
    "buff.skunkette.name": "Skunkette",
    "buff.player.name": "Character",

    // Skunk
    "move.latexShower.name": "Latex Shower",
    "move.latexShower.desc": "Shower a character’s body with living latex.",
    "move.latexPuddle.name": "Latex Puddle",
    "move.latexPuddle.desc": "Spray the ground, trees, and everything else nearby in latex, causing characters to get covered a little more every time they move.",
    "move.latexRegeneration.name": "Latex Regeneration",
    "move.latexRegeneration.desc": "Skunk magic regenerates partially escaped bindings to their highest reached level.",
    "move.latexRegeneration.effect.onCrit": "All Bindings",
    "move.latexRegeneration.effect.onGraze": "One Binding",
    "move.latexRegeneration.effect.onHit": "One Binding",
    "move.latexExplosion.name": "Latex Explosion",
    "move.latexExplosion.desc": "The Latex Skunk destabilizes when it is severely damaged, exploding into a wave of latex that drenches its target.",
    "move.latexExplosion.effect.binding.note": "Explosion hits all four body zones simultaneously.",
    "move.latexExplosion.effect.defeat": "Latex Skunk",

    // Fairy
    "move.bindingMagic.name": "Binding Magic",
    "move.bindingMagic.desc": "Skunk magic animates nearby latex to attack its target.",
    "move.healingMagic.name": "Healing Magic",
    "move.healingMagic.desc": "Uses latex to fill in the gaps in its allies' bodies, healing damage they have taken.",
    "move.healingMagic.effect.others.note": "Heals all damaged [enemies:skunkette], [enemies:skunk], and [enemies:fairy].",
    "move.empoweringMagic.name": "Empowering Magic",
    "move.empoweringMagic.desc": "Arcane fairy magic causes its allies' next attacks to become strangely powerful.",
    "move.empoweringMagic.effect.others.note": "Empowers all [enemies:skunkette], [enemies:skunk], [enemies:fairy], and [enemies:queen].",
    "move.barrierMagic.name": "Barrier Magic",
    "move.barrierMagic.desc": "A translucent black shield protects an enemy from incoming damage.  Absorbing hits drains duration.",

    "buff.empoweringMagic.name": "Empowering Magic",
    "buff.barrierMagic.name": "Barrier Magic",

    // Rainmaker
    "move.latexRain.name": "Latex Rain",
    "move.latexRain.desc": "This contraption only has one function, and that is to rain latex across the battlefield, soaking all characters in a steady stream of bindings.",
    "move.latexRain.effect.amount.crit": "4 × 10",
    "move.latexRain.effect.amount.graze": "2 × 10",
    "move.latexRain.effect.amount.hit": "3 × 10",

    "buff.extraSprayers.name": "Extra Sprayers",

    // Queen
    "move.skunkGun.name": "Skunk Gun",
    "move.skunkGun.desc": "The Queen's gun shoots compressed globs of latex at its targets. They explode and start to cover anything they hit on impact.",
    "move.skunkCollar.name": "Skunk Collar",
    "move.skunkCollar.desc": "This collar is specially made to turn girls into skunks! It will continuously cover its wearer in latex until she is a perfect skunk.",
    "move.callReinforcements.name": "Call Reinforcements",
    "move.callReinforcements.desc": "The Skunk Queen never fights alone! You'll need to go through her creations to finish her for good! Summons increasingly powerful waves of enemy allies.",
    "move.callReinforcements.effect.spawn": "[enemies:skunkette] / [enemies:skunk] / [enemies:fairy]",
    "move.latexRainmaker.name": "Construct Rainmaker",
    "move.latexRainmaker.desc": "The Skunk Queen is adept at static weapons as well as living constructs. Activates increasingly powerful contraptions to spray the party.",
    "move.latexRainmaker.effect.spawn": "[enemies:rainmaker]",
    "move.skunkPerfume.name": "Skunk Perfume",
    "move.skunkPerfume.desc": "The Skunk Queen sprays her perfume, but it's a sweet, rubbery scent that makes those who smell it more attracted to skunks... Randomly applies one of two weakening perfumes or a regenerative perfume.",
    "move.skunkPerfume.effect.heal.note": "Heals damaged [enemies:skunkette], [enemies:skunk], and [enemies:fairy].",

    "buff.defensePerfume.name": "Defense Perfume",
    "buff.escapePerfume.name": "Escape Perfume",
    "buff.empressMight.name": "Empress's Might",
    "buff.goddessMight.name": "Goddess's Might",

    // Bindings
    "binding.latexHead.name": "Skunk Head",
    "binding.latexHead.short": "Head",
    "binding.latexHead.desc": "Living latex that restricts mouth moves and lowers willpower.",
    "binding.latexHead.heavy": "A thick latex hood presses around your head and mouth.",
    "binding.latexHead.light": "A light latex covering begins to surround your head.",
    "binding.latexHead.moderate": "The latex thickens around your mouth, making speech and mouth moves harder.",
    "binding.latexHead.overwhelming": "A solid skunk hood holds your head and mouth tightly in place.",
    "binding.latexHead.severe": "The latex seals your mouth and encloses your head in a skunk-shaped hood.",
    "binding.latexArms.name": "Skunk Arms",
    "binding.latexArms.short": "Arms",
    "binding.latexArms.desc": "Living latex that progressively restricts arm moves and assistance.",
    "binding.latexArms.heavy": "Thick latex paw-shaped gloves cover your hands, making it nearly impossible to use them normally.",
    "binding.latexArms.light": "Simple latex gloves reach up to your elbows.",
    "binding.latexArms.moderate": "Thick latex gloves make it hard to manipulate things, and grow up to your shoulders.",
    "binding.latexArms.overwhelming": "Solid latex paws hold your hands and arms against your shoulders, leaving no room to move.",
    "binding.latexArms.severe": "Latex gloves fold over into half-length skunk paws, trapping your hands and arms against your shoulders.",
    "binding.latexTorso.name": "Skunk Torso",
    "binding.latexTorso.short": "Torso",
    "binding.latexTorso.desc": "Living latex that reduces defense and escape capability.",
    "binding.latexTorso.heavy": "The suit tightens and begins to vibrate.",
    "binding.latexTorso.light": "A thin layer of living latex wraps around your torso.",
    "binding.latexTorso.moderate": "The latex thickens into a close-fitting suit around your torso.",
    "binding.latexTorso.overwhelming": "A solid vibrating suit encases your torso.",
    "binding.latexTorso.severe": "Dense vibrating latex constricts your torso.",
    "binding.latexLegs.name": "Skunk Legs",
    "binding.latexLegs.short": "Legs",
    "binding.latexLegs.desc": "Living latex that reduces defense, trap avoidance, and leg accuracy.",
    "binding.latexLegs.heavy": "The latex forms heavy skunk paws around your feet.",
    "binding.latexLegs.light": "Light latex stockings cover your legs.",
    "binding.latexLegs.moderate": "Thick latex stockings restrict your steps.",
    "binding.latexLegs.overwhelming": "Solid latex paws lock your legs in place.",
    "binding.latexLegs.severe": "Dense latex holds your legs tightly together.",
    "binding.latexCollar.name": "Skunk Collar",
    "binding.latexCollar.short": "Collar",
    "binding.latexCollar.desc": "A controlling collar that lowers willpower and grows other latex bindings.",
    "binding.latexCollar.heavy": "A heavy collar steadily supplies more living latex.",
    "binding.latexCollar.library": "Each tick adds 1/5 of the collar's amount, rounded up, to [bindings:latexHead], [bindings:latexArms], [bindings:latexTorso], and [bindings:latexLegs].\nThe collar does not use the body's normal escape-spreading or peak-restoration behavior.",
    "binding.latexCollar.light": "A living latex collar settles around your neck.",
    "binding.latexCollar.moderate": "The collar thickens, feeding latex onto your body.",
    "binding.latexCollar.overwhelming": "A solid collar anchors the living latex around your neck.",
    "binding.latexCollar.severe": "The dense collar presses firmly around your neck.",
    "binding.skunkBindings.desc": "Living latex forms a connected set of Skunk bindings around the Head, Arms, Torso, and Legs.",
    "binding.skunkBindings.name": "Skunk Bindings",
    "binding.skunkBindings.restoration": "Skunk Bindings can be regenerated by [moves:latexRegeneration].\nRemoving a binding entirely resets its peak amount.",
    "binding.skunkBindings.spreading": "At Heavy and above, escaping from Skunk Bindings causes latex to spread to other body zones.\nThe amount of spread increases as the severity of the binding increases.\nAssists will spread latex onto the actor instead of the target.\nThe spread modifier increases the amount of binding that will be generated when spread happens, even if below Heavy",
    "binding.skunkBindings.transformation": "When all four body zones reach Overwhelming, the character becomes Incapacitated and converts into a hostile Skunkette.\nSkunk Queen will reclaim her collar from converted characters.\nDefeat the converted Skunkette to rescue the character, allowing them to reduce their bindings by half and rejoin the battle.",

    // Trap
    "trap.trapPuddle.name": "Latex Puddle",
    "trap.trapPuddle.desc": "A field hazard that consumes puddles to bind moving characters.",

    // Encounters
    "encounter.prologue.name": "Ko-chan's New Game",
    "encounter.prologue.desc": `"My Lady!  I found an interesting game!"  Ko-chan bounded into the foyer of the dormitory excitedly.
    Matsuko looked up from some papers she was reviewing and smiled.  "Found another way to ignore your work, did you?  What is this new game you found about?"
    "Hu hu.  I found it at a used game store.  It's one of *those* games, you see.  It has multiplayer, so I thought we could all play together.  You have to save some girls from an angry bondage maniac."  Ko-chan hurriedly explained the game to Matsuko.
    Matsuko held the game in her hand and read the back of the case. "Hmm... Interesting enough, I guess.  Let's see if the others want to try it."
    * * *
    "So, how do we play this?"  Hinari spun the disc around her finger and pushed it into the gaming console.
    Ko-chan held up a pair of VR goggles.  "Once you put on the goggles, you enter a battle and try to defeat the enemies before they can completely restrain you.  If we work as a team, we should be able to free each other before things get out of hand."
    Sakari put on the goggles and sat down on a chair.  "You don't need to convince me more.  Let's give it a try."
    "Interest high. Evaluating cooperative potential."  Naruyo seemed like she was already starting to develop her strategies.
    "Very well.  We'll try it out for a while and see if it's worth a deeper look."  Matsuko put on her own goggles and sat on the couch.
    Ko-chan pumped her arm and smiled.  "I can't wait!  Hurry up and start, game!"  She started the game and began to configure her character.`,

    "encounter.plains_1.name": "Ko-chan's First Fight",
    "encounter.plains_1.desc": `Ko-chan appeared outside a small town clad in a fancy white tutu, ballet boots, and long gloves.  Behind her, a pair of fake wings clung to her back.  She looked herself over and smiled.  "It's perfect."
    "A whole character creator and you recreated the same outfit you wear every day?"  Hinari scoffed a bit when she saw Ko-chan's costume.
    Naruyo spoke up for her.  "Understands good workmanship.  I approve."
    "Of course you approve, you made her costume in the first place!"  Sakari ribbed back at her.
    "That's enough.  She can pick whatever she wants and look just as cute, right?"  Matsuko caused Ko-chan to blush with a single comment, as usual.
    Hinari looked around. "So what are we supposed to do anyhow?"
    "There's two quests in the log already.  We can either go check a clearing nearby where some skunk sightings were reported, or we can do some information gathering in town."  Ko-chan read from the system interface.
    Matsuko nodded.  "Let's split up.  Two of us can check around town, and the other three can go investigate that clearing."
    "Sounds good to me."  The rest nodded as they agreed with the plan.
    * * *
    When they got to the clearing, they found a pair of girls already trapped on their elbows and knees in latex skunk suits.  They were spraying down a third girl, who was quickly trapped and controlled by the magic latex bondage.  The three skunks turned towards the party when they approached and immediately started to race towards them.`,

    "encounter.plains_1.victory": `As the skunkettes took more and more damage, their control over their victims faltered, allowing them to start to fight the control from the inside.  Before they could be completely freed, however, their suits forced them to turn tail and run off towards the forest border.
    The party decided to chase them down and save those girls for good before they were forced to assault more people against their wills.`,

    "encounter.plains_2.name": "Ko-chan's Trap",
    "encounter.plains_2.desc": `The party chases the skunkettes to the edge of the forest where they find them resting on the ground. Nearby, a pair of normal sized skunks are spraying them with latex, which patches up the gaps that had been created by the previous battle and restores them to full strength.
    When they notice the party approaching, one of the three skunkettes runs off away from the group while the other two get back to their "feet" and prepare to fight once more.  The two smaller skunks waste no time to start spreading liquid latex all over the area, causing the battlefield to become perilous quickly.
    "Ugh.  Do they have to make it into a slip and slide out here?"
    "Careful, they're coming!"
    The party readies themselves for another battle with the skunk creatures.`,

    "encounter.plains_2.victory": `"Gross.  It's getting everywhere."
    The last skunk exploded into liquid latex and at last, the scene was quiet.  The girls trapped in the suits were freed, but unconscious, so they propped them up under a tree and looked around to see if they could find anything that would explain what was going on.  Finally they found a trail of liquid latex leading to the north that was left by the skunkette that escaped.
    "I guess we should follow the trail?  Be wary of an attack though."
    The party followed the trail for some time, and eventually they found a wooden shack along the edge of the woods.  As they approached, they heard a loud clang and a scream.`,

    "encounter.plains_3.name": "Skunk Queen's Manifesto",
    "encounter.plains_3.desc": `"Argh!  Where is it?!"  The girl was hunched over a box, throwing things over her shoulder every few seconds.  She noticed the party approaching and stood up, turning to face them.
    She was wearing an outfit made out of shiny latex, complete with a bunnysuit, tall boots, and long gloves.  On her head was even a crown coated in black latex and reflecting the sun with its glossy sheen.  "Oooh.  Volunteers.  My second favorite thing after skunks!"
    "Just who volunteered for anything? You must be related to the skunk creatures that have been running around everywhere lately, then?"
    "THEY! ARE! NOT CREATURES!  I have worked very hard to give birth to them, and I won't stand for you insulting them!"  The girl pulled out the gun hanging from her belt and shots it at the party.  They were able to dodge, but the glob of latex coated a nearby tree with a wide band of latex that quickly grew in both directions.
    "I'll turn you all into skunks and make you respect the name of the Skunk Queen! You'll realize the sheer genius of my inventions!"  The Skunk Queen reloads her gun and aims it at the party again.
    "I guess diplomacy was never an option, then?  Let's get this over with."`,

    "encounter.plains_3.victory": `The Skunk Queen staggered away and fell to the ground, the broken bits of her inventions all around her, and the destroyed remains of her skunk creations strewn around the area.
    "That's impossible... I can't lose!"  Without another word, she jumped to her feet and started running.
    "Just give up already. You lost and it's time to face the music." The party gave chase, but the Skunk Queen was quite fast.  Even after a minute or two they were not catching up to her.  The chase was cut off when the Skunk Queen stopped suddenly.  Across from her were two people standing in her way.
    "Right where the reports said you would come.  Good job chasing her here."  One of the two people spoke up.  When they got a good view, the party noticed that it was the two of them that had split off to ask around town.
    "So... you teamed up to corner me, huh?  But don't think you've won just yet! TAKE THIS!" She threw some device on the ground in front of her, and it exploded into a giant wave of latex! The party was thoroughly covered in the latex, which spread to cover their entire bodies! The latex formed mitten paws on their hands, and they were forced onto their toes as the latex formed paws on their feet too.
    "...What th-----hghmmmph"  The party's cries were forcibly muffled by the latex filling their mouths and forming new skunk snouts, while tails sprouted from their behinds that were linked to pairs of vibrators.
    The Skunk Queen laughed maniacally as she watched the results of her handiwork.  She turned around and noticed the party's state before frowning.  "Damn, you didn't get fully skunked like these two... I'll get you next time! You'll never take me alive, heathens!!" She turned and bolted for the forest, and with their newly mittened hands and high heeled feet, the party was in no shape to give chase.
    They reconvened with the other two girls, but they were all in the same shiny condition. Despite their struggles, they were unable to make any headway on their bondage and were stuck quite securely.
    With no way to escape on their own, all they could do was return to town to report their failure and to try and find someone to help them out of their bondage...`,

    "encounter.interlude_1.name": "Ko-chan's Frustration",
    "encounter.interlude_1.desc": `The party suffered greatly in the aftermath of their failure.  The latex suits they were trapped in confined their ability to communicate, and the regenerative power of the latex confounded any attempts to cut them free.  On top of that, they were banned from the guild for letting the Skunk Queen escape.
    With the guild's decree, none of the rest of the townsfolk would help the girls, leaving them trapped without hope for escape.  After a fruitless day or two of trying to get someone to help them, a mage that lived nearby heard about their plight and offered to help.
    "What a predicament you girls are in.  I can help, but it's going to cost you dearly.  You girls now work for me, understand?"
    Having run out of options, the party had no choice but to submit.  They obediently allowed the mage to lock slave collars around their necks.  After all five girls were locked in, the mage dispelled the latex suits with surprising ease.
    "What....How?" Ko-chan immediately questioned the mage's abilities.
    The mage smirked. "Why so surprised? I created the Latex Magic in the first place as a way to capture fugitives. That girl that calls herself the 'Skunk Queen' stole my magical equipment and ran off with it to start abducting girls and making minions."
    Matsuko crossed her arms. "So... you created this problem, why aren't you the one solving it?"
    "She stole all of the prototypes I made, how do you want me to stop her?  For example, the Latex Bomb she used on you girls contains magic-infused latex, which is why your suits regenerated on their own. I can't stand her using my research like this!" The mage seemed incensed.
    "Ugh... So what do we have to do?  And why do we have to wear collars to do it?" Hinari seemed annoyed at this point.
    The mage gave a menacing glare. "This is where you girls come in.  If you ever want those collars off you better get your asses out there and bring me that bitch.  And she had better be properly humbled."
    Sakari laughed. "So.. that's how it is then?  Seems like we have no choice then. Let's get going."
    "Not so fast.  Two of you have to stay behind to make sure the other three are properly... motivated." She snapped her fingers and two of the party were instantly skunked onto their elbows and knees.
    "The rest of you had better get a move on. Even if you fail, come back here and I'll give you another chance... after some light reeducation."  The mage laughed and sent the remaining girls out of her tower.`,

    "encounter.forest_1.name": "Ko-chan's Ambush",
    "encounter.forest_1.desc": `The party set off for the forest to try and capture the Skunk Queen for good.  They didn't see a single latex creature out on the plains, making them wonder if they had retreated to the forest to protect their creator.  As they entered the forest, an unsettling feeling washed over them.
    "...Something is definitely watching us."
    "Unsurprising, considering we are infringing on their territory now."
    "Keep an eye out.  We could be attacked at any time."
    The party advanced slowly through the forest until they got to a small clearing.  Looking around, they found a burnt-out fire, and some remains of camping gear.
    "Look at this!  There's latex on this ruined tent!"
    As the party took a closer look, they failed to keep watch around them, and before they knew it, they were surrounded by skunkettes and a strange fairy creature, who wasted no time in ambushing them!`,

    "encounter.forest_1.victory": `As the last skunkette fell, one of the girls immediately threw up her arms.
    "Literally seconds after I said to keep an eye out--"
    "Yes, yes, we know. We're okay, aren't we? Let's just move on."
    "...Fine! Let's just not get ambushed again..."
    The party quickly moved on from the campsite deeper into the forest.`,

    "encounter.forest_2.name": "Ko-chan's Quagmire",
    "encounter.forest_2.desc": `The further they went into the forest, the more latex they started to see.  Tree trunks were covered, bushes were dripping, and puddles covered the ground.  It started to get rather dangerous to move around without stepping in the latex.
    "Just who would do something like this..."
    They reached another clearing, but its contents were nothing like what they were expecting.  Before them stretched a vast swamp of latex.  When they entered the clearing they were immediately noticed by some skunks that were busy 'repairing' the damage on a pair of skunkettes.  Another one of those fairy creatures was nearby as well.`,

    "encounter.forest_2.victory": `Finally, they defeated the largest group of the skunk creatures yet.  After moving the rescued girls to a dry patch of ground, they looked around to try and find the path forward again.
    "Just how many of these things are there?"
    "She's certainly been busy in the time we spent trying to get free..."
    "Let's hurry up and find her so we can get out of here."
    After a while, they found something of a trail leading deeper into the woods and started to follow it.`,

    "encounter.forest_3.name": "Skunk Queen's Empire",
    "encounter.forest_3.desc": `After a few hours of wandering the forest, the party reached the deepest part. By this point, there wasn't a single piece of foliage around that wasn't covered in shiny latex. The latex-coated trees thinned, revealing a clearing where the Skunk Queen was sitting on a makeshift throne of latex-covered branches and rocks. On either side sat a skunkette with a glittering collar, and a skunk fairy fluttered around like a loyal attendant.
    "We meet again, my dear volunteers. I am so glad you are so eager to become my pets!"
    "I'll make you pay for the humiliation I've suffered!"
    "I see you managed to escape the suits I gave you girls. How disappointing. Well, don't worry, I'll make sure you don't escape them this time."
    "Enough talk! Prepare to meet your maker!"
    "As you wish. I've got the perfect place for all of you in my new empire of skunks! Have at you!"`,

    "encounter.forest_3.victory": `After a grueling battle, an unblocked hit to the side sent the Skunk Queen sprawling to the ground.  She hit the ground hard, her gun spinning away on the latex-coated ground.  Before she could scramble over to it, a knee pressed into her back...
    "Not so fast, your highness." One of the girls put more weight onto the Skunk Queen's back, making her groan and struggle in pain.
    "G-get off me, you bitch!" The Skunk Queen struggled more vigorously before her head was pressed into the ground as well.
    "I've been wanting to do this for a long time now." One of the party approached with the Skunk Gun and turned it up to its maximum level.  She aimed carefully at the Skunk Queen as she begged for mercy, and just before she fired, the one holding the Skunk Queen down stepped back.  Huge globs of latex were fired by the gun, which collided directly with the Skunk Queen's head and back.
    She kept shooting as the latex quickly spread over the struggling girl's body, and before long, she was heavily suited in the shiny latex.  Eventually, a dull click indicated that the gun was empty, and she stood down.
    "That should be enough.  Let's finish this up, then."
    The discarded Skunk Collar was fitted around the Skunk Queen's neck.  It closed seamlessly with a dull click, and glowed brightly with magic, causing green lines to spread over the surface of the latex skunk suit.  The Skunk Queen could only whine and struggle weakly.
    "Good work.  Let's get her back to the mage so we can get out of our own collars."
    All three girls nodded and made their way out of the latex forest with their target in hand.`,

    "encounter.interlude_2.name": "Ko-chan's Triumph",
    "encounter.interlude_2.desc": ``,

    "encounter.tower_1.name": "Skunk Empress's Scheme",
    "encounter.tower_1.desc": "The Skunk Empress opens with strengthened forces, collars on the party, and an ambush.",

    "encounter.tower_2.name": "Goddess's Assistance",
    "encounter.tower_2.desc": "The Goddess assists the party against the Skunk Empress’s strengthened forces.",

    "encounter.tower_3.name": "Goddess's Resurgence",
    "encounter.tower_3.desc": "Stronger divine assistance gives the party another chance against the Skunk Empress.",

    "encounter.epilogue.name": "Goddess's Resurgence",
    "encounter.epilogue.desc": "Stronger divine assistance gives the party another chance against the Skunk Empress.",

    "encounter.outside.name": "Goddess's Trial",
    "encounter.outside.desc": "Face the Goddess with the former rulers serving as her minions.",

};

