import lessons from '../../../src/lib/hrai-lessons';
import {soldierBattleStarterProject} from '../../../src/lib/hrai-lessons/soldier-battle-starter';

test('HRAI lesson library contains the course lessons', () => {
    expect(lessons).toHaveLength(11);
    expect(lessons.map(lesson => lesson.id)).toEqual([
        '01-space-rover',
        '02-pearl-diver',
        '03-rally-paddle',
        '04-rain-shelter',
        '05-parcel-courier',
        '06-cloud-hopper',
        '07-cave-glider',
        '08-crosswalk-crew',
        '09-meteor-guard',
        '10-farm-stand',
        '11-soldier-battle'
    ]);
    lessons.forEach(lesson => {
        expect(lesson.stages.length).toBeGreaterThan(0);
    });
});

test('Soldier Battle starter prepares four named units without scripts', () => {
    const [stage, ...units] = soldierBattleStarterProject.targets;

    expect(stage.name).toBe('Stage');
    expect(units.map(unit => unit.name)).toEqual([
        'Modry mec',
        'Modry luk',
        'Cerveny mec',
        'Cerveny luk'
    ]);
    expect(units.every(unit => Object.keys(unit.blocks).length === 0)).toBe(true);
    expect(lessons.find(lesson => lesson.id === '11-soldier-battle').stages).toHaveLength(9);
});
