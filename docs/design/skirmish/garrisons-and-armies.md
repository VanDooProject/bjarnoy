# Garrisons and armies

Part of [Skirmish](README.md). Where units stand, how they are sent and where they come back to. Linked realms
([economy.md](../economy.md) §5) have no shared garrison: their units walk between longhouses like everywhere else.

## Where units stand
- Land units are garrisoned at a longhouse or a tower, ships at a Dockyard. Only there do they eat from the stock (in a
  linked realm the shared stock).
- Garrisoned units show no marker on the map. Every other unit is an army in the field, with a marker.
- Land units set out from their longhouse, ships from their Dockyard.

## Fights are per hex
- Only the units on a hex fight there: the garrison of that hex and the armies standing on it. An attack on one longhouse
  of a linked realm is defended by that longhouse's garrison, not by the rest of the realm.
- The tower bonus counts only the towers whose claim disc covers the hex.
- In a fight in the open field, an army is at home on a hex inside your realm or an ally's. The bonus there comes only
  from the towers whose claim disc covers that hex.
- A fleet that attacks a shore building fights only the units on that building's hex. If none stand there, it damages the
  building without a fight.

## Sending troops to a target
- You choose how many units of each type to send. They are collected from your nearest garrisons (of every settlement,
  linked or not) and from your armies standing in the field.
- The part with the longest way sets out first. The others set out later and join it on its way, so one army can have
  several meeting points.
- Until it sets out, a part stays in its garrison.
- A part that loses units before it sets out (a raid, starvation) goes with what is left. The provisions it can no longer
  carry go back to the stock; what it can still carry it keeps.
- A part from a garrison loads its provisions from the stock of the realm it stands in. An army from the field brings
  what it still carries.

## Moving armies
- You can pick any of your armies in the field and move it.
- A Move that ends on one of your longhouses or towers joins the garrison there.
- Your armies whose Moves end on the same hex join into one army.

## Coming back
- An army that comes back (after its mission, or when its provisions run low) walks to the nearest of your longhouses
  (ships: your nearest Dockyard) and joins the garrison there. That can be another settlement than the one it left from, linked or not.
- To have it somewhere else, you move it there.

## Support from allies
- An ally can send support to one of your longhouses or towers. It stands on that hex and defends only that hex. Your
  stock feeds it, and you can send it home at any time.

## Training
- Training runs per building (queues and the split over several buildings: [economy.md](../economy.md) §5, "Training
  troops").
- Finished land units stay at the building that trained them as an army in the field. They stay there until you move
  them, or until their provisions run low and they walk to the nearest longhouse on their own.
- Each fresh unit gets free provisions: its full load, but never more than the food in its training cost.

## Linked realms
- Each longhouse of a linked realm keeps its own garrison. Units get from one to another by walking.
- When the link breaks, units stay where they are.
- Training has one queue for the whole realm, and every longhouse of the realm shows it. Each training building
  still has at most 5 orders. An order split over several buildings can use every building of that type in the realm.
