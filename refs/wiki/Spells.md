Spells - The Noita Wiki

# Spells

Spells, and choosing how to use them, is a core part of Noita. You can obtain new spells in a few ways, such as by collecting them off naturally generated wands, by opening chests, by buying them from shops, or by finding them in special locations. There are many different "types" of spells, but most either add a projectile to the current wand's shot, or modify something about the current shot state. 

Non-shuffle wands will always cast the spells sequentially in a left-to-right order, thus enabling complex yet predictable combinations. Modifier type spells will generally only affect the current shot state in a wand, though some will affect global data like recharge time. Wands with an "Always Cast" spell will cast that spell along with any other spells every time the wand is cast. To learn more basics about how spells and modifiers can be used, see the Guide To Wand Mechanics. 

Shuffle wands behave similarly to non-shuffle wands, but when a shuffle wand is recharged, edited or swapped to the order of spells is randomized. 

See the Spell Information Table for a list of all spells and their statistics. For an explanation of spell tiers, and where specific spells can be found, see Spell Tiers. 

## Contents

- 1 Spell Attributes

- 1.1 Uses
- 1.2 Mana Drain
- 1.3 Cast Delay
- 1.4 Recharge Time
- 1.5 Spread Modification
- 1.6 Radius
- 1.7 Speed
- 1.8 Crit Chance Bonus
- 1.9 Damage
- 2 Damage Types
- 3 Hidden Spell Attributes
- 4 Tips
- 5 Spell List By Type

- 5.1 Projectile
- 5.2 Static Projectile
- 5.3 Passive
- 5.4 Utility
- 5.5 Projectile Modifier
- 5.6 Material
- 5.7 Multicast
- 5.8 Other
- 6 Spell Tag Cloud
- 7 Suffixes
- 8 Videos
- 9 See Also

## Spell Attributes

### Uses

For spells with limited uses, the number of times they can be cast before being depleted. Limited use spells tend to be more powerful than unlimited ones for the stage of Noita they are found, and can often be used to great tactical advantage. Depleted spells are restored using the Spell Refreshers found inside each Holy Mountain. Wands will just skip over any depleted spells without spending mana. 

### Mana Drain

The amount of mana required to cast the spell. If a wand does not have enough mana in reserve to cast a spell it is skipped over, and may be wrapped into subsequently. 

duration in seconds [1] 

### Cast Delay

The time the Wand waits after it is fired. Wands have a built-in Cast Delay stat which can be increased or reduced by spells. Reducing delay increases firing rate (up the maximum rate of 60 shots per second). Cast delay is calculated for each multicast set of spells, and is ignored entirely for spells inside Trigger payloads. Usually shown in game. 

duration in seconds [1] 

### Recharge Time

Whenever firing a wand leaves its Deck empty or causes a Wrap to occur, the wand must recharge before it can fire again. All spells on a wand which modify Recharge time contribute to the final value at the end of the spell casting cycle, including those inside Triggers. 

arc in degrees

### Spread Modification

The spread of a projectile is the range of deviation it can have from the "intended" direction. It is the sum of the innate spread for that type of projectile, additive spread modifications from spells, and, if not cast inside a Trigger/Timer, some Perk and status effects, and the wand's built-in Spread stat. If the total spread is negative, it behaves as zero spread. 

length in pixels

### Radius

The radius of the explosion (if any) caused by a projectile. See Explosive Projectile for why this stat can be important. 

scalar, pixels/second [1] 

### Speed

Spells that alter the speed multiplier

Dormant Crystal

A crystal that explodes when caught in an explosion

Dormant Crystal With Trigger

A crystal that explodes and casts another spell when caught in an explosion

Nuke

Take cover!

Giga Nuke

What do you expect?

Slimeball

A dripping ball of poisonous slime

Unstable Crystal

A crystal that explodes when someone comes nearby

Unstable Crystal With Trigger

A crystal that explodes and casts another spell when someone comes nearby

Heavy Shot

Greatly increases the damage done by a projectile, at the cost of its speed

Light Shot

Makes a projectile move considerably faster, but deal less damage

Fizzle

Gives a spell a small probability of short-circuiting

Fly Downwards

Causes a projectile to aim straight downwards a short time after casting

Fly Upwards

Causes a projectile to aim straight upwards a short time after casting

Chaotic Path

Causes a projectile to chaotically fly wherever it wishes

Slithering Path

Makes a projectile move rapidly in a slithering manner, like a snake

Phasing Arc

Makes a projectile fly much slower, but teleport short distances over its flight

Projectile Area Teleport

If a valid target appears somewhere in the proximity of a projectile, the projectile will teleport right on top of the target

Speed Up

Increases the speed at which a projectile flies through the air

Accelerating Shot

Causes a projectile to accelerate as it flies

Decelerating Shot

Makes a projectile decelerate as it flies

Projectile Energy Shield

Gives a projectile a shield that deflects other projectiles

Explosive Projectile

Makes a projectile more destructive to the environment

Glittering Field

Small explosions appear randomly over a large area

The speed multiplier affects how fast projectiles multicast together start off moving. It is usually capped at 20×.

Projectiles are created with either a fixed initial speed, or one picked at random from a range between a minimum and maximum value. Variation in initial speed translates into a variation in range. Most projectiles are capped to the default Terminal Velocity of 1,000px/s, and if spawned with a higher initial speed will instead travel at this limit. Lightning Bolt is a notable exception to this (having terminal velocity disabled) and can move a lot faster - up to the upper limit of 61,440 px/s. 

The initial speed of a projectile can be changed by other spells (see spells that modify speed for a list) and some perks, notably Faster Projectiles. Some modifiers also alter projectile speed over time, e.g. Accelerating Shot/ Decelerating Shot. Projectile top speed is still capped by Terminal Velocity, although a projectile with high acceleration will reach top speed again more quickly after being slowed down. The multiplier for initial speed usually caps at 20×, but Fly Upwards/ Fly Downwards can be used to raise the multiplier beyond this. 

Slow moving projectiles can be hard to aim, the target has usually moved by the time they arrive and you need to, at the least, lead your target (i.e. shoot at the point you predict they will be when the projectile gets there). Enemies in the game are pretty good at this, so try not to move too predictably. 

Homing modifiers also help avoid misses - they all work slightly differently making them suit different projectiles better. Very slow moving projectiles like Pollen can be useful for doing damage over time using modifiers like Damage Field - hitting the target directly isn't necessary. 

Along with lifetime, speed also determines the maximum range of a projectile. It's often not possible to increase projectile range by increasing speed (due to the Terminal Velocity of 1000px/s for most projectiles), in which case try increasing lifetime instead. 

Some projectiles also have a speed below which they die immediately, both when initially spawned, and each game frame after any acceleration is applied. Some projectiles do more damage if their speed when they hit an enemy is higher than their initial speed when fired. 

percentage

### Crit Chance Bonus

A bonus to the chance that projectiles will critically strike, dealing 5 times the usual damage (and dealing even further damage if critical chance is above 100%). The same crit chance applies to all projectiles launched together (from the same shot state). 

### Damage

The amount of damage dealt by projectiles added by the spell, listed by damage types. If no damage type is given then it is Projectile damage. Some damage types are more effective than others against different enemies. [2] 

Notes:

1. ↑ 1.0 1.1 1.2 In-game time; one second = 60 frames.
2. ↑ If the damage is more than 9 quintillion, the interface can't show the number

Many spells and hazards in Noita inflict damage, and damage comes in different types - e.g. Fire, Ice, Melee, etc. The ones which don't are either non-damaging utility spells or transformation types. 

| Hidden spell attributes | |
| --- | --- |
| Attribute | Description |
| Lifetime frames ‡ | lifetimemod Projectile Lifetime Modifiers Null Shot Increases a projectile's duration dramatically but removes all damage and explosion from it Chain Spell Causes a projectile to cast a copy of itself upon expiring, up to 5 times Increase Lifetime Increases the lifetime of a spell Reduce Lifetime Reduces the lifetime of a spell Orbiting Arc A projectile orbits the point of its origin Phasing Arc Makes a projectile fly much slower, but teleport short distances over its flight Ping-Pong Path Makes a projectile fly back and forth Spiral Arc A projectile flies in a spiralling pattern True Orbit Makes a projectile rotate around the caster like an orbiting planet Spells that extend or shorten a projectile's life. The maximum duration in which a projectile remains active. This is measured in game frames or "ticks" - roughly equivalent to 1/60th of a second. [1] Modifying the lifetime of a projectile tends to change the range it can cover, and can have some interesting and useful effects. |
| Timer Lifetime frames ‡ | timer Timer Spells Add Timer Makes a projectile cast another spell after a short time Energy Orb With A Timer A slow but powerful orb of energy that casts another spell after a timer runs out Luminous Drill With Timer A pinpointed, short-ranged beam of concentrated light that casts another spell after a timer runs out Magic Arrow With Timer A magical arrow that casts another spell after a timer runs out Magic Bolt With Timer A powerful magical bolt that casts another spell after a timer runs out Spark Bolt With Timer A spark bolt that casts another spell after a timer runs out Energy Sphere With Timer A fast, arcing projectile that casts another spell after a timer runs out Spitter Bolt With Timer A short-lived magical bolt that casts another spell after a timer runs out Large Spitter Bolt With Timer A more powerful version of Spitter Bolt that casts another spell after a timer runs out Giant Spitter Bolt With Timer The most powerful version of Spitter Bolt that casts another spell after a timer runs out Summon Tentacle With Timer Calls a terrifying appendage from another dimension! Comes with a timer Spells that create projectiles that carry a payload of other spells, released when they hit a target, or after a fixed delay. Some spells come with a Timer (a form of Trigger), the duration of which is set independently to the spell's Lifetime. After this fixed duration passes the projectile releases a secondary payload of one or more spells. |
| Recoil | setlowrecoil Recoil Reducing Spells Cursed Sphere A projectile that brings bad luck to anyone it hits Expanding Sphere A slow projectile that increases its damage over time Lightning Bolt The primordial force of nature Disc Projectile Summons a sharp disc projectile Arrow Summons an arrow Energy Sphere A fast, arcing projectile Energy Sphere With Timer A fast, arcing projectile that casts another spell after a timer runs out Spells that set recoil to a low value. Some spells have a Recoil effect, which can be significant enough to send you flying in the other direction. Can be mitigated by spells that reduce recoil, or which reset it to a fixed value. |
| Friendly Fire | friendlyfire Friendly Fire Spells Touch of Gold? Transmutes everything in a short radius into urine, including walls, creatures... and you Touch of Grass Transmutes everything in a short radius into Earth, including walls, creatures... and you. Unless… Circle of Fire An expanding circle of burning air Circle of Acid An expanding circle of dripping acid Acid Transmute drops of acid from nothing Sea Of Lava Summons a large body of lava below the caster Sea Of Acid Summons a large body of acid below the caster Touch Of Blood Transmutes everything in a short radius into blood, including walls, creatures... and you Touch Of Gold Transmutes everything in a short radius into gold, including walls, creatures... and you Touch Of Oil Transmutes everything in a short radius into oil, including walls, creatures... and you Touch Of Smoke Transmutes everything in a short radius into smoke, including walls, creatures... and you Touch Of Spirits Transmutes everything in a short radius into alcohol, including walls, creatures... and you Touch Of Water Transmutes everything in a short radius into water, including walls, creatures... and you Electric Torch Gives your wand a bright but very dangerous light! Acid Ball A terrifying acidic projectile Black Hole A slow orb of void that eats through all obstacles Black Hole with Death Trigger A slow orb of void that eats through all obstacles and casts another spell as it expires Bomb Summons a bomb that destroys ground very efficiently Bomb Cart Summons a self-propeled mine cart loaded with explosives Cursed Sphere A projectile that brings bad luck to anyone it hits Death Cross A deadly energy cross that explodes after a short time Giga Death Cross A giant, deadly energy cross that explodes after a short time Plasma Beam Cross Four deadly plasma beams in a cross-shape. Look out, they can hurt you as well! Dormant Crystal A crystal that explodes when caught in an explosion Dormant Crystal With Trigger A crystal that explodes and casts another spell when caught in an explosion Dynamite Summons a small explosive Eldritch Portal Summons a one-way portal to a sinister realm Expanding Sphere A slow projectile that increases its damage over time Fireball A powerful exploding spell Firebolt A bouncy, explosive bolt Firebolt With Trigger A bouncy, explosive bolt that that casts another spell upon collision Large Firebolt A more powerful version of Firebolt Giant Firebolt The most powerful version of Firebolt Odd Firebolt A somewhat peculiar bouncy, explosive bolt Fireworks! A fiery, explosive projectile Glitter Bomb Summons a bomb that explodes into volatile fragments Glowing Lance A magical lance that cuts through soft materials Healing Bolt A magical bolt that heals other beings Holy Lance A fast-flying, penetrating lance that glows with power Holy Bomb Summons a bomb that... well... Giga Holy Bomb Bigger and therefore holier Iceball A magical ball of frozen fire Lightning Bolt The primordial force of nature Thunder Charge A projectile with immense stored electricity Ball Lightning Summons three short range electrical orbs Magic Missile A fiery, explosive projectile Large Magic Missile A more powerful version of Magic missile Giant Magic Missile The most powerful version of Magic missile Meteor A destructive projectile from the skies! Flock Of Ducks Summons a chaotic flock of spicy ducks Infestation A bunch of magical sparks that fly in every direction Nuke Take cover! Giga Nuke What do you expect? Path Of Dark Flame A trail of dark, deadly flames Pinpoint Of Light An extremely concentrated point of light that explodes after a moment Plasma Beam An instantaneous, dangerous beam of light Plasma Cutter A plasma beam specialized in cutting materials! Pollen A small, floating projectile that homes towards nearby creatures Prickly Spore Pod Summons a spore pod that attaches to a surface and then grows and explodes into spikes Propane Tank Summons a propane tank. Be careful what you wish for. Disc Projectile Summons a sharp disc projectile Giga Disc Projectile Summons a large, serrated disc with a curious flight pattern Summon Omega Sawblade That's a lot of sawblade Slimeball A dripping ball of poisonous slime Arrow Summons an arrow Summon Deercoy Summons a seemingly-innocuous deer Summon Explosive Box Summons a box of explosive matter Summon Large Explosive Box Summons a large box of explosive matter Summon Missile A missile!!! Summon Rock Spirit Summons an autonomous rock ally Homebringer Teleport Bolt Brings the target hit closer to you Unstable Crystal A crystal that explodes when someone comes nearby Unstable Crystal With Trigger A crystal that explodes and casts another spell when someone comes nearby White Hole An orb of positive energy that destroys everything in its path Clusterbolt Makes a projectile release a cluster of explosive bolts upon hitting a wall Fire Arc Creates arcs of fire between projectiles (requires 2 projectile spells) Gunpowder Arc Creates arcs of gunpowder between projectiles (requires 2 projectile spells) Poison Arc Creates arcs of poison between projectiles (requires 2 projectile spells) Electric Arc Creates arcs of lightning between projectiles (requires 2 projectile spells) Downwards Bolt Bundle Makes a projectile separate into a bundle of 5 explosive bolts as soon as it moves downwards Octagonal Bolt Bundle Makes a projectile launch 8 magical bolts if it moves slowly enough Bubbly Bounce Makes a projectile shoot bubble sparks as it bounces Explosive Bounce Makes a projectile explode as it bounces Lightning Bounce Makes a projectile release powerful lightning as it bounces Plasma Beam Bounce A projectile launches a plasma beam upon bouncing Bloodlust A projectile gains a hefty damage boost, but is also able to hurt you Explosion On Drunk Enemies Makes a projectile explode upon collision with creatures covered in alcohol Giant Explosion On Drunk Enemies Makes a projectile explode powerfully upon collision with creatures covered in alcohol Explosion On Slimy Enemies Makes a projectile explode upon collision with creatures covered in slime Giant Explosion On Slimy Enemies Makes a projectile explode powerfully upon collision with creatures covered in slime Fireball Orbit Makes four fireballs rotate around a projectile Nuke Orbit Makes four… nukes(?!) rotate around a projectile Sawblade Orbit Makes four sawblades rotate around a projectile Plasma Beam Orbit Makes four plasma beams rotate around a projectile Personal Fireball Thrower Makes a projectile turn the creatures it hits into living fireball throwers Personal Lightning Caster Makes a projectile turn the creatures it hits into living thunderstorms Piercing Shot Makes a projectile fly through enemies, but harmful to the caster Chaos Magic Makes a projectile launch a random spell (out of a limited selection) when it hits something Random Modifier Spell Casts one random modifier spell Explosive Projectile Makes a projectile more destructive to the environment Firecrackers Makes a projectile release firecrackers when it disappears Fireball Thrower Makes a projectile cast fireballs in random directions Lightning Thrower Makes a projectile cast lightning in random directions Two-Way Fireball Thrower Makes a projectile fire small fireballs perpendicular to its trajectory Plasma Beam Thrower A projectile fires beams of light in random directions Acid Trail Gives a projectile a trail of acid Fire Trail Gives a projectile a trail of fiery particles Gunpowder Trail Gives a projectile a trail of gunpowder Poison Trail Gives a projectile a trail of poison Horizontal Barrier A thin, horizontal barrier that harms passing creatures, including you Vertical Barrier A thin, vertical barrier that harms passing creatures, including you Square Barrier A thin, square-shaped barrier that harms passing creatures, including you Circle of Buoyancy A field of levitative magic Circle of Displacement A field of teleportative magic Circle of Thunder A field of electrifying magic Circle of Vigour A field of regenerative magic Thundercloud Creates a thundercloud Glittering Field Small explosions appear randomly over a large area Meteorisade"Alea iacta est" Muodonmuutos Baa Giga Black Hole A growing orb of negative energy that destroys everything in its reach Omega Black Hole Even light dies eventually... Explosion A powerful explosion! Explosion of Brimstone A fiery explosion! Explosion of Thunder An electric explosion Magical Explosion A large explosion that doesn't damage the ground Omega White Hole A massive orb of positive energy that destroys everything in its reach Spells that can hurt you. Many projectiles, in their unmodified form, don't hurt you directly. Some however have " Friendly Fire" enabled - making them able to hit you too. This is often the price paid for a hefty damage boost. Caution is advised, especially when using spells which have Piercing effects. Friendly Fire can also be enabled on otherwise safe projectiles by modifiers, which affect all projectiles they are multicast with. Can Hit Shooter After frames ‡ Related to Friendly Fire, this stat determines how long it takes for a newly created projectile to become harmful to you. Projectiles with Lifetimes shorter than this 'grace period' are safe to use - even if they have Friendly Fire enabled - but be wary of extending their Lifetime. |
| Piercing & Penetrating | piercing Spells that Pierce Kantele - Note A Music for your ears! Kantele - Note D Music for your ears! Kantele - Note D+ Music for your ears! Kantele - Note E Music for your ears! Kantele - Note G Music for your ears! Ocarina - Note A Music for your ears! Ocarina - Note B Music for your ears! Ocarina - Note C Music for your ears! Ocarina - Note D Music for your ears! Ocarina - Note E Music for your ears! Ocarina - Note F Music for your ears! Ocarina - Note G+ Music for your ears! Ocarina - Note A2 Music for your ears! Death Cross A deadly energy cross that explodes after a short time Giga Death Cross A giant, deadly energy cross that explodes after a short time Plasma Beam Cross Four deadly plasma beams in a cross-shape. Look out, they can hurt you as well! Dormant Crystal A crystal that explodes when caught in an explosion Lightning Bolt The primordial force of nature Ball Lightning Summons three short range electrical orbs Blood Mist A cloud of blood mist Mist Of Spirits A cloud of potent alcohol Slime Mist A cloud of slimy mist Toxic Mist A cloud of toxic mist Flock Of Ducks Summons a chaotic flock of spicy ducks Pinpoint Of Light An extremely concentrated point of light that explodes after a moment Plasma Beam An instantaneous, dangerous beam of light Plasma Cutter A plasma beam specialized in cutting materials! Summon Omega Sawblade That's a lot of sawblade Spiral Shot A mystical whirlwind of magic sparks Summon Deercoy Summons a seemingly-innocuous deer Summon Explosive Box Summons a box of explosive matter Summon Fish FISH! Unstable Crystal A crystal that explodes when someone comes nearby Unstable Crystal With Trigger A crystal that explodes and casts another spell when someone comes nearby Piercing Shot Makes a projectile fly through enemies, but harmful to the caster Circle of Fervour A field of berserk magic Circle of Shielding A field of protective magic Circle of Stillness A field of freezing magic Circle of Thunder A field of electrifying magic Circle of Transmogrification A field of sheep-like magic Circle of Unstable Metamorphosis A field of transformative magic Circle of Vigour A field of regenerative magic Rain Cloud Creates a watery weather phenomenon Oil Cloud Creates a rain of oil Blood Cloud Creates a rain of blood Acid Cloud Creates a rain of acid Thundercloud Creates a thundercloud Glittering Field Small explosions appear randomly over a large area Meteorisade"Alea iacta est" Summon Fly Swarm Summons five flies to aid you in battle Summon Firebug Swarm Summons four fire bugs to aid you in battle Summon Wasp Swarm Summon six wasps to aid you in battle Summon Friendly Fly Summons a friendly fly that attacks your enemies! Summon Platform Summons a shortlived bit of ground Summon Wall Summons a shortlived obstacle Spells that can hit multiple targets multiple times. Typically a projectile ceases to be when it hits and damages an enemy, but some projectiles have (or can be modified to have) the property of " Piercing" - and will keep on repeatedly hitting and doing damage to an enemy while in contact with it. Projectiles with a Trigger or Timer payload will also release that payload repeatedly for each time they hit - at no extra mana cost. |
| | penetrating Spells that Penetrate Black Hole A slow orb of void that eats through all obstacles Black Hole with Death Trigger A slow orb of void that eats through all obstacles and casts another spell as it expires Chain Bolt Fires a mysterious bolt that jumps from enemy to enemy Holy Lance A fast-flying, penetrating lance that glows with power Magic Guard Four guarding lights rotate around you for a time Big Magic Guard Eight guarding lights rotate around you for a time Freezing Gaze A heart-freezingly sinister aura Rock Create a mighty rock out of thin air Summon Tentacle Calls a terrifying appendage from another dimension Summon Tentacle With Timer Calls a terrifying appendage from another dimension! Comes with a timer Return After a period of time, you'll be returned to where you cast this spell White Hole An orb of positive energy that destroys everything in its path Worm Launcher Summons a giant worm to cause havoc for a moment! Circle of Buoyancy A field of levitative magic Circle of Displacement A field of teleportative magic Explosive Detonator All nearby explosive spells cast by you instantly detonate Delayed Spellcast A static, magical phenomenon that casts 3 extra spells after a short while Projectile Gravity Field Projectiles caught within the field are attracted towards its center Projectile Thunder Field Projectiles caught within the field transform into blasts of lightning Projectile Transmutation Field Projectiles caught within the field transform into harmless critters Omega Black Hole Even light dies eventually... Omega White Hole A massive orb of positive energy that destroys everything in its reach Vacuum Field Sucks nearby projectiles and creatures into the middle of the field instantaneously Long-Distance Cast Casts a spell some distance away from the caster Teleporting Cast Casts a spell from the closest enemy Warp Cast Makes a spell immediately jump a long distance, stopped by walls Spells that can hit multiple targets, but each only once. " Penetrating" has a similar effect to Piercing, but allows only a single hit per target. |

Notes:

1. ↑ Noita typically runs at 60fps, so to convert frames to seconds divide by 60. E.g. a spell with a Lifetime of 200 frames will last for: 200 / 60 = ~3.33s.

## Tips

- Wands that have an electrical spell on them will become electrified. If the wand is in contact with a conductive material for a few seconds, such as metals or liquids, it will send an electric current through that material, potentially electrocuting the wand-holder.
- Long-range spells with a Trigger or Timer can be used to cast potentially harmful spells (such as the Touch of [X] spells, Earthquake, explosions, spells involving hazardous liquids, etc.) at a safe distance away from yourself.
- "Formation" and "Multicast" modifiers can be used in combination with spells with a Trigger or Timer modifier, allowing you to cast multiple spells from a single Trigger or Timer spell. This might be referred to as the "payload".
- Placing a modifier or multicast spell at the very end of a wand's queue will result in the wand casting spells from earlier in the queue with the modifier/multicast applied.
- Spells with Trigger or Timer modifiers can be used to bypass the cast delay on spells such as Lightning Bolt, allowing for deadly rapid fire combinations.

## Spell List By Type

There are 422 spells in Noita, categorised into 8 types. 

While they provide a useful hint of what the spell is likely to do, the lines between spell types can blur. Any type of spell can create projectiles (that move or stay still), make modifications to projectiles, create material, run scripted effects, etc. The Utility and Other type spells, in particular, defy categorisation. 

There are some rules that apply based on spell type: 

- Which of the Greek Letter spells work, e.g.: 

- Gold To Power behaves very much like a Modifier type spell, but Mu won't copy it.
- How Add Trigger interacts with the spell, e.g.: 

- The Note spells behave like Projectile type spells, but Add Trigger ignores them and won't use them to make a with-trigger projectile.
- How the wand tracks charges for Spells with limited uses, e.g.: 

- Using Matter Eater with Long-Distance Cast does not consume charges.

### Projectile

There are 122 Projectile type spells. 

Projectile type spells can also be copied using: 

### Static Projectile

There are 45 Static Projectile type spells. 

Static Projectile type spells can also be copied using: 

### Passive

There are 5 Passive type spells. 

### Utility

There are 25 Utility type spells. 

### Projectile Modifier

There are 143 Projectile Modifier type spells. 

Projectile Modifier type spells can also be copied using: 

### Material

There are 26 Material type spells. 

### Multicast

There are 14 Multicast type spells. 

### Other

There are 42 Other type spells. 

## Spell Tag Cloud

These tags group together spells which have similar properties, or which can be used to achieve the same purpose. 

No query arguments were provided. acid aineveruses alcohol altlife arceffect areaeffect blood bomb bouncemod building circleliquid circlemagic copyaction copyrelated criticalmod damagemodify defaultradius deleteliquid digging drawsbefore electricity expiration fire friendlyfire greek gunpowder healing homing icy larpa lifetimemod light lightning loopable lowterminal materialparticle mattergen mist multi multiprojectile multistage nature neverunlimited nospeedcheck oil onepixel pathgravity pathmod pathseeker pattern penetrating personal piercing plasma pointy poison projaccel projectilefield projkiller pulverise quest radiusbonus radiusmaterial random recursive remotecast sawblade scripted seismic setlowrecoil shielding singularity slime speeddamage speedmodify spreadmod starter staticexplosion swappable teleport tentacle terrainreact throwermod timer touchof toxic trail transmutation transmutemod travel trickkills trigger triggerfail vacuumfield water wrongrelated

## Suffixes

Though mechanically the 'variances' are separate, distinct spells, you might consider the following properties as 'modifiers' that are applied to those spells. 

| Icon | Suffix | Effect | Example |
| --- | --- | --- | --- |
| | …With Timer | Timers release a payload of one (or more) spells after a fixed duration. If an obstacle is hit before that duration has passed it will act similarly to a Trigger instead. | |
| | …With Trigger | Triggers release a payload of one (or more) spells upon collision with terrain or an entity. | |
| | …With Double Trigger | Double Triggers release a payload of two (or more) spells upon collision with terrain or an entity. Comparable to a (single) trigger followed by Double Spell. Spark Bolt With Double Trigger is the only spell currently in Noita with this 'suffix'. | |

## Videos

This content includes possible spoilers or secrets. Tread carefully.

Load video

YouTube

YouTube might collect personal data. Privacy Policy Continue Dismiss

Utility Spells - Noita - B.I.G. - Nympshpyre

Utility

Material

Multicast