import {loadGameStarter} from '../../../src/lib/hrai-game-starter';

test('loads a functional starter and creates missing sprites from local assets', async () => {
    const project = {
        targets: [
            {isStage: true, name: 'Stage', blocks: {}, variables: {old: ['old', 0]}},
            {
                isStage: false,
                name: 'Sprite1',
                blocks: {},
                variables: {},
                costumes: [{name: 'costume1'}],
                layerOrder: 1,
                x: 0,
                y: 0
            }
        ]
    };
    const vm = {
        toJSON: () => JSON.stringify(project),
        loadProject: jest.fn(() => Promise.resolve())
    };
    const starter = {
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {'hrai-score': ['Skóre', 0]},
                blocks: {stage: {opcode: 'event_whenflagclicked'}}
            },
            {isStage: false, name: 'Hráč', x: -120, y: 0, blocks: {player: {opcode: 'motion_changexby'}}},
            {isStage: false, name: 'Cíl', x: 120, y: 0, blocks: {goal: {opcode: 'control_forever'}}}
        ],
        monitors: [{id: 'hrai-score-monitor', opcode: 'data_variable'}]
    };

    await loadGameStarter(vm, starter);

    const loaded = vm.loadProject.mock.calls[0][0];
    expect(loaded.targets.map(target => target.name)).toEqual(['Stage', 'Hráč', 'Cíl']);
    expect(loaded.targets[0].blocks).toEqual(starter.targets[0].blocks);
    expect(loaded.targets[1].blocks).toEqual(starter.targets[1].blocks);
    expect(loaded.targets[2].blocks).toEqual(starter.targets[2].blocks);
    expect(loaded.targets[0].variables).toEqual({'hrai-score': ['Skóre', 0]});
    expect(loaded.targets[1]).toMatchObject({x: -120, y: 0});
    expect(loaded.targets[2]).toMatchObject({
        x: 120,
        y: 0,
        layerOrder: 2,
        costumes: [{name: 'costume1'}]
    });
    expect(loaded.monitors).toEqual(starter.monitors);
});
