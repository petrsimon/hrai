# Soldier Battle

## Goal

Control your soldiers and attack the enemy. In the first version soldiers do not move. Click one of your soldiers, then click an enemy.

Scratch does not normally expose a right-mouse-button block. The game therefore uses two left clicks:

1. Click one of your soldiers.
2. Click an enemy soldier.

The selected soldier gets a yellow highlight. If the enemy is in range, it takes damage.

## Soldiers

| Soldier | Range | Damage | Health |
|---|---:|---:|---:|
| Sword | 1 square | 2 | 3 |
| Bow | 4 squares | 1 | 3 |

Do not add obstacles or complicated visibility in the first version. First make selection, attacks, and health work.

## Steps

### 1. Board

Create a battlefield with friendly soldiers and enemies. Add a sword soldier and a bow soldier. Each soldier needs team, type, health, row, and column information.

### 2. Selection

Use `when this sprite clicked`. When a friendly soldier is clicked, store its ID in `selected soldier` and show a yellow highlight. When an enemy is clicked, store its ID in `target soldier`.

### 3. Sword attack

Calculate the distance between the selected soldier and the target. A sword may attack only at a distance of one square or less. A valid attack removes two health points.

### 4. Health and death

Every soldier starts with three health points. When health reaches zero or below, hide the soldier. For an enemy, increase `dead enemies` and decrease `living enemies`.

### 5. Bow attack

A bow has range four and deals one damage. Reuse the same selection system, but use the selected soldier’s type to choose range and damage.

### 6. Timer and reinforcements

The game lasts exactly sixty seconds. Every five seconds a new enemy appears. Choose its type randomly between sword and bow. Add at most five reinforcements. After the timer ends, stop attacks and reinforcement creation.

### 7. Result

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
