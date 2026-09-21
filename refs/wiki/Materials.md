Materials - The Noita Wiki

# Materials

This article may need cleanup to meet quality standards.

There are many different materials in Noita, each with their own special properties and effects. Liquid materials are often distinguished by their densities, and solid materials by their Durability and Hardness. There are some materials that can damage you. 

## Contents

- 1 Material types
- 2 Material properties

- 2.1 Density
- 2.2 Durability
- 2.3 Hardness
- 3 Solids

- 3.1 Wood
- 3.2 Brick
- 3.3 Rock
- 3.4 Meat
- 3.5 Conductive
- 3.6 Frozen
- 3.7 Free Solids
- 3.8 Other
- 4 Liquids

- 4.1 Standard Liquids
- 4.2 Molten Materials
- 4.3 Magical Liquids
- 5 Gasses
- 6 Powders

- 6.1 Standard Powders
- 6.2 Ground & Soil
- 6.3 Plants
- 7 Fire
- 8 Food
- 9 Player damage
- 10 See Also

## Material types

Materials all fall into the following categories: 

: | Name | Properties |
| --- | --- |
| Solids | Materials that consist of solid pixels that do not move. They can be removed or be transformed into other types by spells. |
| Liquids | Substances that form flat pools and lakes inside suitable pits. They can be bottled in Flasks and often inflict various Status Effects. Each liquid has its own Density, causing it to layer above or below other liquids. |
| Magical Liquids | Similar to normal liquids, but all have some sort of transmutative or magical effect. Most of them commonly spawn inside Flasks on pedestals. |
| Gaseous | Non-collision pixels that obey gravity inversely, flowing upwards instead of down and forming "lakes" in pits in cave ceilings. |
| Powders | Materials that flow downwards and are subjected to gravity. They will naturally form piles on the ground. |
| Organic and Others | Anything else that doesn't quite fit into the other categories, such as background objects, meat, or fire. |

### Density

Density is a primarily a property of Liquids in Noita, which causes heavier (more dense) liquids to sink, and lighter (less dense) liquids to rise. [Similar to a Layered drink.] 

### Durability

Durability determines resistance to damage. Projectiles like Luminous Drill, and all explosions such as those from Bomb, have a maximum durability that they can be used to destroy. If a material's durability exceeds this value, the projectile or explosion will not damage or destroy it. If a material has no durability defined, only its hardness is used for damage calculations. 

The following table lists the maximum durability threshold of some spells, as well as some examples of materials with those durabilities. 

: | Durability | Materials | Example Spells |
| --- | --- | --- |
| None | does not destroy materials | |
| 4 | Sand | |
| 5 | Cheese | |
| 8 | Coal, Concrete | |
| 9 | Meat (Static) | |
| 10 | Dense Rock, Soil, Rusted Metal (Static) | |
| 11 | Rusted Steel | |
| 12 | Extremely Dense Rock, Steel | |
| 13 | Dense Steel | |
| 14 | Brickwork, Cursed Rock | |

### Hardness

Explosion from Energy Orb (ray_energy=350,000) in coal (HP = 25,000) vs. rock (HP = 100,000)

Hardness also determines resistance to damage, secondarily to Durability. 

Each pixel of material has an 'HP' value in the materials file. An explosion traces multiple rays around the point of explosion. These rays have a maximum "ray energy" that is used to consume the HP of each pixel of the material the ray is travelling through, up to the maximum radius of the explosion. When the "ray energy" is used up, the material is no longer destroyed. 

This is why, for example, Unstable Crystal is worse at digging than TNT; TNT, in addition to being able to damage materials up to 11 durability (vs. 10 for Unstable Crystal), has more than 30 times the "ray energy" of Unstable Crystal, meaning that for materials with a lot of hardness like rock, explosions from Unstable Crystal will only destroy 2-3 pixels of material, whereas TNT is likely to remove material up to its full radius of 28 pixels. 

## Solids

Brickwork

`templeslab_static`

Brickwork

`templebrick_static_soft`

Brickwork

`templebrickdark_static`

Brickwork

`templebrick_thick_static_noedge`

Brickwork

`templebrick_thick_static`

Brickwork

`templerock_static`

Brickwork

`templebrick_noedge_static`

Brickwork

`templebrick_static`

Diamond Brickwork

`templebrick_diamond_static`

Mossy Brickwork

`templebrick_moss_static`

Odd Brickwork

`wizardstone`

Ruined Brick Wall

`templebrick_static_ruined`

### Rock

Corrupted Rock

`corruption_static`

Cursed Rock

`rock_static_cursed`

Damp Rock

`rock_static_wet`

Dense Rock

`rock_box2d_nohit_hard`

Dense Rock

`rock_hard`

Eroding Rock

`rock_eroding`

Extremely Dense Rock

`rock_hard_border`

Frozen Rock

`snowrock_static`

Greed-Cursed Rock

`rock_static_cursed_green`

Grey Rock

`rock_static_grey`

Hell Rock

`skullrock`

Hell Rock

Poisonous Rock

`rock_static_poison`

Rock

`rock_box2d_nohit_heavy`

Rock

`poop_box2d_hard`

Rock

Rock

`rock_static_intro_breakable`

Rock

`rock_static_box2d`

Rock

`rock_box2d_nohit`

`rock_box2d_hard`

`rock_box2d`

Rock

`rock_static_trip_secret2`

Rock

`rock_static_trip_secret`

Rock

Rock

Rock

Rock

`waterrock`

Toxic Rock

`rock_static_radioactive`

Vault Rock

Volcanic Rock

`lavarock_static`

### Meat

Ambiguous Meat

`meat_confusion`

Burned Meat

`meat_burned`

Cooked Meat

`meat_hot`

Cursed Meat

`meat_cursed_dry`

Cursed Meat

`meat_cursed`

Ethereal Meat

`meat_teleport`

Frog Meat

`meat_frog`

Fruit Flesh

`meat_fruit`

Fruit Flesh

`meat_pumpkin`

Fully-Cooked Meat

`meat_done`

Green Slimy Meat

`meat_slime_green`

Lightly-Cooked Meat

`meat_warm`

Meat

`meat_static`

Meat

`meat`

Meat

`item_box2d_meat`

Meat Of An Innocent Creature

`meat_helpless`

Slimy Cursed Meat

`meat_slime_cursed`

Slimy Meat

`meat_slime_orange`

Slimy Meat

`meat_slime`

Stinky Meat

`meat_polymorph_protection`

Unstable Meat

`meat_polymorph`

Weird Meat

`meat_trippy`

Wobbly Meat

`meat_fast`

Worm Meat

`meat_worm`

### Conductive

$mat_cloth

`cloth_box2d`

Aluminium

`aluminium_robot`

Aluminium

Aluminium

Dense Steel

`steel_static_strong`

Dense Steel

`steel_grey_static`

Frozen Steel

`steelfrost_static`

Gold

`gold_box2d`

Hardened Steel

`steel_static_unmeltable`

Metal

`metal_prop`

Metal

`metal_prop_low_restitution`

Metal

`metal_prop_loose`

`metal_hard`

Metal

`metal`

Metal

Metal

`metal_chain_nohit`

Metal

`metal_wire_nohit`

Metal Pipe

Mossy Steel

`steelmoss_slanted`

Ruby

`bloodgold_box2d`

Rusted Metal

`metal_rust_rust`

Rusted Metal

`metal_rust_barrel_rust`

Rusted Metal

`metal_rust_barrel`

Rusted Metal

`metal_rust`

Rusted Steel

Rusted Steel

`steel_rusted_no_holes`

Rusted Steel

Smoking Steel

Steel

### Frozen

Frozen Acid

Frozen Acid

Frozen Blood

Frozen Blood

`ice_blood_glass`

Frozen Poison

`ice_poison_static`

Frozen Poison

`ice_poison_glass`

Frozen Slime

`ice_slime_static`

Frozen Slime

`ice_slime_glass`

Ice

`ice_cold_static`

Ice

`ice_cold_glass`

Ice

`ice_static`

Ice

`ice_glass`

Ice

`ice_meteor_static`

Toxic Ice

`ice_radioactive_static`

Toxic Ice

`ice_radioactive_glass`

### Free Solids

Bomb

`fuse_bright`

Bomb

`fuse`

Bone

`bone_box2d`

Cactus

`cactus`

Cocoon

`cocoon_box2d`

Collapsed Concrete

Crystal

`crystal_solid`

Crystal

`crystal`

Crystal

`crystal_magic`

Fungal Matter

`grass_loose`

Fungus

`fungus_loose`

Fungus

`fungus_loose_green`

Gem

`gem_box2d_green`

Gem

`gem_box2d_pink`

Gem

`gem_box2d_red`

Gem

`gem_box2d_orange`

`gem_box2d_red_float`

Gem

`gem_box2d_darksun`

Gem

`gem_box2d_yellow_sun_gravity`

Gem

`gem_box2d_yellow_sun`

Glass

`potion_glass_box2d`

Green Meteorite

`fuse_holy`

Ice

`ice_melting_perf_killer`

Ice

Ice

Magical Crystal

Magical Crystal

Mat_Gem_Box2D_White

Neon Tube

Neon Tube

Neon Tube

`neon_tube_blood_red`

Neon Tube

`nest_firebug_box2d`

Plastic

`plastic`

Plastic

`plastic_prop`

Purple Crystal

`crystal_purple`

Snow

`snow_b2`

Sulphur

`sulphur_box2d`

Tempered Glass

`glass_liquidcave`

Tnt

`tnt_static`

Tnt

`tnt`

Tnt

`fuse_tnt`

Turquoise Gemstone

`gem_box2d_turquoise`

Turquoise Gemstone

`gem_box2d_opal`

Wax

`wax_b2`

Weird Fungus

`fungus_loose_trippy`

Who Knows

`physics_throw_material_part2`

Australium

`static_magic_material`

Blood

`blood_thick`

Blue Fungus

`spore_pod_stalk`

Blue Fungus

`bluefungi_static`

Bone Wall

Brittle Glass

`glass_brittle`

Cheese

Coal Vein

Concrete

Fool's Gold

Fungal Soil

`rock_static_fungal`

Glass

Glass

Glowing Matter

`rock_static_glow`

Glowing Stone

`glowstone`

Glowing Stone

`glowstone_altar`

Glowing Stone

`glowstone_potion`

Glowing Stone

Gold Vein

Granite Ground

Ground

Hell Slime

Hell Slime

Ice

Lush Ground

`sand_static_rainforest`

Magic Gate

Meteorite

Neon Tube

Nest

Packed Snow

Rusted Metal

Rusty Ground

Slime

`slime_static`

Text

Toxic Gold

`gold_static_radioactive`

Vibrant Gold Vein

`gold_static_dark`

Vine

Vine

`root_growth`

Vine

`vine`

Water

`water_static`

## Liquids

### Standard Liquids

Acid

`acid`

Alchemic Precursor

`midas_precursor`

Beer

`beer`

Blood

`blood_fading_slow`

Blood

`blood_fading`

Blood

`blood`

Blood Mist

`cloud_blood`

Brine

`water_salt`

Cement

`cement`

Chilly Water

`water_ice`

Creepy Liquid

`creepy_liquid`

Draught Of Midas

Fire

`liquid_fire`

Freezing Liquid

`blood_cold`

Fungus Blood

`blood_fungi`

Greed-Cursed Liquid

`cursed_liquid`

Hearty Porridge

`porridge`

Instant Deathium

`just_death`

Juhannussima

`juhannussima`

Lava

`lava`

Liquid Fire

`liquid_fire_weak`

Magical Liquid

`plasma_fading_green`

Magical Liquid

`plasma_fading_bright`

Magical Liquid

`plasma_fading_pink`

Magical Liquid

Milk

Mimicium

Molut

Pea Soup

`pea_soup`

Peat

`peat`

Poison

`poison`

Sima

`sima`

Slime

`slime_green`

Slime

`slime`

Slime

`slime_yellow`

Slime Mist

`cloud_slime`

Slush

`slush`

Smoke

`rocket_particles`

Swamp

`water_swamp`

Swamp

`swamp`

Toxic Mist

`cloud_radioactive`

Toxic Sludge

`radioactive_liquid_yellow`

Toxic Sludge

`radioactive_liquid`

Toxic Sludge

`radioactive_liquid_fading`

Urine

`urine`

Void Liquid

`void_liquid`

Vomit

`vomit`

Water

`water_fading`

Water

`water`

Water

`water_temp`

Whiskey

Worm Blood

`blood_worm`

### Molten Materials

Molten materials are always-burning materials created when a solid or powder material comes into contact with Lava or melted in some other way. They will in most cases cause the On Fire! debuff when touched. These are materials tagged with [molten] or [molten_metal]. 

Molten Aluminium

`aluminium_robot_molten`

Molten Aluminium

`aluminium_oxide_molten`

Molten Aluminium

`aluminium_molten`

Molten Brass

`brass_molten`

Molten Copper

`copper_molten`

Molten Glass

`glass_molten`

Molten Glass

`glass_broken_molten`

Molten Gold

`gold_molten`

Molten Metal

`metal_nohit_molten`

Molten Metal

`metal_rust_molten`

Molten Metal

`steel_molten`

Molten Metal

`metal_sand_molten`

Molten Metal

`metal_molten`

Molten Metal

`metal_prop_molten`

Molten Plastic

`plastic_red_molten`

Molten Plastic

`plastic_grey_molten`

Molten Plastic

`plastic_prop_molten`

Molten Plastic

Molten Silver

`silver_molten`

Molten Steel

`steelmoss_static_molten`

Molten Steel

`steel_rust_molten`

Molten Steel

`steelsmoke_static_molten`

Molten Steel

`steelmoss_slanted_molten`

Molten Steel

`steel_static_molten`

Molten Wax

`wax_molten`

### Magical Liquids

While most liquids and powders can spawn in a Flask, Magical Liquids nearly always do, aside from some that also appear in pools or are created with Alchemy. These mostly consist of materials tagged with [magic_liquid]. 

Acceleratium

`magic_liquid_movement_faster`

Ambrosia

`magic_liquid_protection_all`

Berserkium

`magic_liquid_berserk`

Chaotic Polymorphine

`magic_liquid_random_polymorph`

Concentrated Mana

`magic_liquid_mana_regeneration`

Diminution

`magic_liquid_weakness`

Flummoxium

`material_confusion`

Gate-Opener

`magic_liquid`

Hastium

`magic_liquid_faster_levitation_and_movement`

Healthium

`magic_liquid_hp_regeneration`

Invisiblium

`magic_liquid_invisibility`

Levitatium

`magic_liquid_faster_levitation`

Lively Concoction

`magic_liquid_hp_regeneration_unstable`

Ominous Liquid

Pheromone

`magic_liquid_charm`

Polymorphine

`magic_liquid_polymorph`

Pus

`pus`

Rainbow

`material_rainbow`

Teleportatium

`magic_liquid_teleportation`

Unstable Polymorphine

`magic_liquid_unstable_polymorph`

Unstable Teleportatium

`magic_liquid_unstable_teleportation`

Worm Pheromone

`magic_liquid_worm_attractor`

: | Material | Gimmick |
| --- | --- |
| Polymorphine | Polymorph |
| Chaotic Polymorphine | Chaos Polymorph |
| Unstable Polymorphine | Unstable Polymorph |
| Berserkium | Berserk |
| Teleportatium | Teleportitis |
| Unstable Teleportatium | Unstable Teleportitis |
| Pheromone | Charmed |
| Invisiblium | Invisible |
| Concentrated Mana | Mana Regeneration |
| Acceleratium | Greased Lightning |
| Levitatium | Faster Levitation |
| Hastium | Faster Levitation and Greased Lightning |
| Flummoxium | Confused |
| Healthium | Regeneration |
| Lively Concoction | Regeneration |
| Worm Pheromone | Worm Food |
| Ambrosia | Protection from all |
| Ominous Liquid | Poisoned |
| Rainbow | Rainbow Farts |

The following materials do not have a [magic_liquid] tag but do have some incredible effect. 

: | Material | Gimmick |
| --- | --- |
| Alchemic Precursor | Precursor for Draught of Midas. |
| Draught Of Midas | Converts almost anything it touches to gold. |

## Gasses

There are a small set of gasses and vapours in Noita, the most common of which are Smoke and Steam. 

Cloud

`cloud`

Cloud

`cloud_lighter`

Diminution Cloud

`magic_gas_weakness`

Flammable Gas

`acid_gas_static`

Flammable Gas

`acid_gas`

Freezing Vapour

`blood_cold_vapour`

Fungal Gas

`fungal_gas`

Funky Cloud

`magic_gas_fungus`

Funky Vapour

`sand_herb_vapour`

Gas Of Midas

`magic_gas_midas`

Healium

`magic_gas_hp_regeneration`

Nauseating Gas

`poo_gas`

Poison Gas

`poison_gas`

Polymorphine Cloud

`magic_gas_polymorph`

Smoke

`smoke_explosion`

Smoke

`smoke_magic`

Smoke

`smoke_static`

Smoke

`smoke`

Steam

`steam_trailer`

Steam

`steam`

Teleportatium Cloud

`magic_gas_teleport`

Toxic Gas

`radioactive_gas`

Toxic Gas

Unicorn Farts

`rainbow_gas`

Whiskey Fumes

`alcohol_gas`

Worm Gas

`magic_gas_worm_blood`

## Powders

### Standard Powders

Brass

`brass`

Burning Powder

`burning_powder`

Coal

`coal`

Concrete

`concrete_sand`

Copper

`copper`

Diamond

Excrement

Fungal Soil

`fungus_powder_bad`

Fungal Soil

`fungus_powder`

Glass

`glass_broken`

Glue

`glue`

Gold

`gold`

Guiding Powder

Gunpowder

`gunpowder_unstable`

Gunpowder

`gunpowder_explosive`

Gunpowder

Gunpowder

Gunpowder

`gunpowder_unstable_big`

Hell Slime

`endslime_blood`

Herb

`sand_herb`

Honey

`honey`

Mämmi

`mammi`

Metal Dust

`metal_sand`

Monstrous Powder

`monster_powder_test`

Plastic

`plastic_grey`

Plastic

`plastic_red`

Purifying Powder

`purifying_powder`

Ratty Powder

`rat_powder`

Salt

`salt`

Shock Powder*

`shock_powder`

Silver

`silver`

Slimy Meat

`gunpowder_unstable_boss_limbs`

Sodium

`sodium`

Steel

`steel_sand`

Sulphur

`sulphur`

Toxic Gold

`gold_radioactive`

Wax

Wet Sodium

`sodium_unstable`

### Ground & Soil

Barren Soil

`soil_dark`

Barren Soil

Blue Sand

Fungal Soil

`fungisoil`

Rotten Meat

`rotten_meat`

Sand

Sand

Sand

Sandstone

`sandstone`

Slimy Meat

`meat_slime_sand`

Snow

`soil_lush`

`soil_lush_dark`

Toxic Meat

`rotten_meat_radioactive`

Volcanic Sand

### Plants

Divine Ground

Evergreen Seed

`bush_seed`

Fungal Spore

`mushroom_seed`

Fungal Spore

`mushroom_giant_red`

Fungal Spore

`mushroom_giant_blue`

Fungal Spore

`mushroom`

Fungus

`fungi_creeping_secret`

Fungus

`fungi_green`

Fungus

`fungi_yellow`

Glowing Fungal Spore

`glowshroom`

Grass

`grass`

Grass

`grass_darker`

Grass

`grass_dark`

Grass

`grass_dry`

Ice

`grass_ice`

Moss

`moss`

Mystery Fungus

`fungi_creeping`

Plant Material

Plant Material

`plant_material_dark`

Plant Seed

Rusty Moss

`moss_rust`

Seed

Seed

`plant_material_red`

Seed

`spore`

Weird Fungus

`fungi`

## Fire

Fire

`fire_blue`

Fire

`flame`

Fire

`fire`

Spark

`spark_white_bright`

Spark

`spark_blue_dark`

Spark

`spark_green_bright`

Spark

`spark_red_bright`

Spark

`spark_purple_bright`

Spark

`spark_player`

Spark

`spark_green`

Spark

Spark

`spark_blue`

Spark

`spark_purple`

Spark

`spark_red`

Spark

`spark_yellow`

Spark

Spark

Fire

Liquid Fire

Materials with the [food] tag can be consumed to receive benefits while having the Eat Your Vegetables perk, although some also have negative consequences. 

Blood

`blood_fading_slow`

Blood

`blood_fading`

Blood

`blood`

Fungus Blood

`blood_fungi`

Hearty Porridge

`porridge`

Pea Soup

`pea_soup`

Slime

`slime`

Slime

`slime_green`

Slime

`slime_yellow`

Vomit

`vomit`

Worm Blood

`blood_worm`

Rotten Meat

`rotten_meat`

Slimy Meat

`meat_slime_sand`

Toxic Meat

`rotten_meat_radioactive`

Ambiguous Meat

`meat_confusion`

Blood

`blood_thick`

Burned Meat

`meat_burned`

Cooked Meat

`meat_hot`

Cursed Meat

`meat_cursed`

Cursed Meat

`meat_cursed_dry`

Ethereal Meat

`meat_teleport`

Frog Meat

`meat_frog`

Fruit Flesh

`meat_fruit`

Fruit Flesh

`meat_pumpkin`

Fully-Cooked Meat

Green Slimy Meat

`meat_slime_green`

Lightly-Cooked Meat

`meat_warm`

Meat

`meat`

Meat

Meat Of An Innocent Creature

`meat_helpless`

Slime

`slime_static`

`meat_slime_cursed`

Slimy Meat

`meat_slime_orange`

Slimy Meat

`meat_slime`

Stinky Meat

`meat_polymorph_protection`

Unstable Meat

`meat_polymorph`

Weird Meat

`meat_trippy`

Wobbly Meat

`meat_fast`

Worm Meat

`meat_worm`

## Player damage

: | Player material damage | | | | |
| --- | --- | --- | --- | --- |
| Material Id | Material In-game | Per frame, per pixel | DPS per pixel | DPS submerged (85 pixels) |
| acid | Acid | 0.125 | 7.5 | 637.5 |
| rock_static_cursed | Cursed Rock | 0.125 | 7.5 | 637.5 |
| magic_gas_hp_regeneration | Healium | -0.125 | -7.5 | -637.5 |
| rock_static_cursed_green | Greed-Cursed Rock | 0.100 | 6.0 | 510.0 |
| lava | Lava | 0.075 | 4.5 | 382.5 |
| poison | Poison | 0.025 | 1.5 | 127.5 |
| radioactive_gas | Toxic Gas | 0.025 | 1.5 | 127.5 |
| radioactive_gas_static | | | | |
| rock_static_radioactive | Toxic Rock | 0.025 | 1.5 | 127.5 |
| rock_static_poison | Poisonous Rock | 0.025 | 1.5 | 127.5 |
| ice_radioactive_static | Toxic Ice | 0.025 | 1.5 | 127.5 |
| ice_radioactive_glass | | | | |
| ice_acid_static | Frozen Acid | 0.025 | 1.5 | 127.5 |
| ice_acid_glass | | | | |
| blood_cold | Freezing Liquid | 0.0225 | 1.35 | 114.75 |
| blood_cold_vapour | Freezing Vapour | 0.015 | 0.9 | 76.5 |
| cursed_liquid | Greed-Cursed Liquid | 0.0125 | 0.75 | 63.75 |
| gold_radioactive | Toxic Gold | 0.005 | 0.3 | 25.5 |
| gold_static_radioactive | | | | |
| poo_gas | Nauseating Gas | 0.00025 | 0.015 | 1.275 |