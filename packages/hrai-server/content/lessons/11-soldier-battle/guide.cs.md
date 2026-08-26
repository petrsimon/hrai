# Bitva vojáků

## Cíl hry

Ovládáš vlastní vojáky a útočíš na nepřátele. V první verzi se vojáci nepohybují. Klikneš na svého vojáka, potom klikneš na nepřítele.

Scratch běžně nerozlišuje pravé tlačítko myši v blocích. Proto hra používá dvě kliknutí levým tlačítkem:

1. Klikni na svého vojáka.
2. Klikni na nepřátelského vojáka.

Vybraný voják viditelně změní vzhled. Když je nepřítel v dosahu, dostane poškození.

## Vojáci

| Voják | Dosah | Poškození | Životy |
|---|---:|---:|---:|
| Meč | 1 políčko | 2 | 3 |
| Luk | 4 políčka | 1 | 3 |

Pro první verzi nepřidávej překážky ani složitou viditelnost. Nejdřív ověř, že funguje výběr, útok a životy.

## Postup

### 1. Bojiště

Přidej bojiště, několik vlastních vojáků a několik nepřátel. Vytvoř vojáka s mečem a vojáka s lukem. Každý voják potřebuje informace o týmu, typu, životě, řádku a sloupci.

### 2. Rozpoznání kliknutí

Vyber postavu `Modry mec` v seznamu postav. Z kategorie Události přidej `po kliknutí na tuto postavu`. Kliknutí v seznamu pouze otevře postavu pro úpravy; tento blok naopak rozpozná kliknutí hráče na vojáka během hry.

### 3. Zapamatování aktivního vojáka

Vytvoř pro všechny postavy proměnnou `vybraný voják`. Pod událost kliknutí nastav její hodnotu na ID modrého vojáka. Hra tak bude vědět, který voják má provést příští útok.

### 4. Viditelné označení

Pod nastavení proměnné přidej viditelnou změnu vzhledu, například nastav efekt barvy na 25. Hráč musí bez pohledu na proměnnou poznat, který voják je aktivní.

### 5. Útok mečem

Po kliknutí na nepřítele ulož jeho ID do `cílový voják`. Vypočítej vzdálenost mezi řádkem a sloupcem vybraného vojáka a cíle. Meč smí zaútočit jen na vzdálenost nejvýše jedno políčko. Při platném útoku odečti nepříteli dva životy.

### 6. Životy a smrt

Každý voják začíná se třemi životy. Pokud životy klesnou na nulu nebo níže, voják se skryje. U nepřítele zvyš `mrtví nepřátelé` a sniž `živí nepřátelé`.

### 7. Útok lukem

Luk má dosah čtyři políčka a způsobí jedno poškození. Použij stejný výběr jako u meče, ale jiný dosah a poškození podle typu vojáka.

### 8. Čas a posily

Hra trvá přesně šedesát sekund. Každých pět sekund se objeví nový nepřítel. Jeho typ vyber náhodně mezi mečem a lukem. Posil může být nejvýše pět. Po uplynutí času zastav útoky i vytváření posil.

### 9. Výsledek

Po konci hry vyšleš zprávu `konec hry` a oznámíš výsledek:

- vyhráváš, pokud `mrtví nepřátelé > živí nepřátelé`,
- jinak prohráváš.

## Doporučené proměnné

Společné proměnné:

- `hra běží`
- `vybraný voják`
- `cílový voják`
- `mrtví nepřátelé`
- `živí nepřátelé`
- `počet posil`

Proměnné každého vojáka:

- `ID`
- `tým`
- `typ`
- `životy`
- `řádek`
- `sloupec`

## Rozšíření po dokončení

- pohyb po mřížce,
- tah nepřítele,
- animace a zvuky útoku,
- překážky a omezení viditelnosti,
- ukazatele životů,
- různá místa pro objevování posil.
