import {loadGameStarter} from '../../../src/lib/hrai-game-starter';

test('loads starter blocks into stage and player while preserving other sprites', async () => {
    const project = {
        targets: [
            {isStage: true, name: 'Stage', blocks: {}, variables: {old: ['old', 0]}},
            {isStage: false, name: 'Sprite1', blocks: {}, variables: {}},
            {isStage: false, name: 'Extra', blocks: {keep: {}}, variables: {}}
        ]
    };
    const vm = {
        toJSON: () => JSON.stringify(project),
        loadProject: jest.fn(() => Promise.resolve())
    };
    const starter = {
        targets: [
            {isStage: true, name: 'Stage', blocks: {stage: {opcode: 'event_whenflagclicked'}}},
            {isStage: false, name: 'Hráč', blocks: {player: {opcode: 'motion_changexby'}}}
        ]
    };

    await loadGameStarter(vm, starter);

    const loaded = vm.loadProject.mock.calls[0][0];
    expect(loaded.targets.map(target => target.name)).toEqual(['Stage', 'Hráč', 'Extra']);
    expect(loaded.targets[0].blocks).toEqual(starter.targets[0].blocks);
    expect(loaded.targets[1].blocks).toEqual(starter.targets[1].blocks);
    expect(loaded.targets[2].blocks).toEqual({keep: {}});
    expect(loaded.targets[0].variables).toEqual({});
});
