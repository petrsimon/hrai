import lessons from '../../../src/lib/hrai-lessons';

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
