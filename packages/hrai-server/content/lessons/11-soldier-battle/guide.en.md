# Soldier Battle

## Goal

Control your soldiers and attack the enemy. In the first version soldiers do not move. Click one of your soldiers, then click an enemy.

Scratch does not normally expose a right-mouse-button block. The game therefore uses two left clicks:

1. Click one of your soldiers.
2. Click an enemy soldier.

The selected soldier visibly changes appearance. If the enemy is in range, it takes damage.

## Soldiers

| Soldier | Range | Damage | Health |
|---|---:|---:|---:|
| Sword | 1 square | 2 | 3 |
| Bow | 4 squares | 1 | 3 |

Do not add obstacles or complicated visibility in the first version. First make selection, attacks, and health work.

## Steps

### 1. Board

Create a battlefield with friendly soldiers and enemies. Add a sword soldier and a bow soldier. Each soldier needs team, type, health, row, and column information.

### 2. Detect the click

Select `Modry mec` in the sprite list. Add `when this sprite clicked` from Events. Clicking in the sprite list only opens a sprite for editing; this event detects the player's click during the running game.

### 3. Remember the active soldier

Create a `selected soldier` variable for all sprites. Under the click event, set it to the blue soldier's ID. The game can now remember which soldier should perform the next attack.

### 4. Mark the active soldier

Add a visible appearance change below the variable assignment, such as setting the color effect to 25. The player must be able to recognize the active soldier without reading the variable.

### 5. Sword attack

When an enemy is clicked, store its ID in `target soldier`. Calculate the distance between the selected soldier and the target. A sword may attack only at a distance of one square or less. A valid attack removes two health points.

### 6. Health and death

Every soldier starts with three health points. When health reaches zero or below, hide the soldier. For an enemy, increase `dead enemies` and decrease `living enemies`.

### 7. Bow attack

A bow has range four and deals one damage. Reuse the same selection system, but use the selected soldier’s type to choose range and damage.

### 8. Timer and reinforcements

The game lasts exactly sixty seconds. Every five seconds a new enemy appears. Choose its type randomly between sword and bow. Add at most five reinforcements. After the timer ends, stop attacks and reinforcement creation.

### 9. Result

Broadcast `game over` and show the result:

- win when `dead enemies > living enemies`,
- otherwise lose.

## Suggested variables

Shared variables:

- `game running`
- `selected soldier`
- `target soldier`
- `dead enemies`
- `living enemies`
- `reinforcements`

Variables for each soldier:

- `ID`
- `team`
- `type`
- `health`
- `row`
- `column`

## Extensions

- movement on a grid,
- an enemy turn,
- attack animations and sounds,
- obstacles and limited visibility,
- health bars,
- different reinforcement positions.
