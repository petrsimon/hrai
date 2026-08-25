import battlefieldSvg from '!raw-loader!../../../static/hrai/lessons/soldier-battlefield.svg?';
import blueSwordSvg from '!raw-loader!../../../static/hrai/lessons/blue-sword.svg?';
import blueBowSvg from '!raw-loader!../../../static/hrai/lessons/blue-bow.svg?';
import redSwordSvg from '!raw-loader!../../../static/hrai/lessons/red-sword.svg?';
import redBowSvg from '!raw-loader!../../../static/hrai/lessons/red-bow.svg?';

const ASSET_IDS = {
    battlefield: '47eb6062b07d89bc1976a2c7444de8a5',
    blueSword: 'c542b6b56eb2aa1c116d88330378303e',
    blueBow: '03a32f1ee308cf5ec4fc87b08edd1138',
    redSword: 'bb040e2a5c7e53c817b4e6c2f65ba3d6',
    redBow: '69b0b5fce3646cd18a4af65083ebc486'
};

const costume = (assetId, name) => ({
    assetId,
    name,
    md5ext: `${assetId}.svg`,
    dataFormat: 'svg',
    rotationCenterX: 50,
    rotationCenterY: 60
});

const sprite = (name, assetId, x, y) => ({
    isStage: false,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    currentCostume: 0,
    costumes: [costume(assetId, name)],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x,
    y,
    size: 50,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around'
});

export const soldierBattleStarterProject = {
    projectVersion: 3,
    targets: [
        {
            isStage: true,
            name: 'Stage',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            currentCostume: 0,
            costumes: [costume(ASSET_IDS.battlefield, 'Bojiste')],
            sounds: [],
            volume: 100,
            tempo: 60,
            layerOrder: 0,
            videoState: 'on',
            videoTransparency: 50,
            textToSpeechLanguage: null
        },
        sprite('Modry mec', ASSET_IDS.blueSword, -120, 90),
        sprite('Modry luk', ASSET_IDS.blueBow, -120, -90),
        sprite('Cerveny mec', ASSET_IDS.redSword, 120, 90),
        sprite('Cerveny luk', ASSET_IDS.redBow, 120, -90)
    ],
    meta: {
        semver: '3.0.0',
        vm: '0.2.0',
        agent: 'hrai soldier battle starter'
    }
};

const assets = [
    [ASSET_IDS.battlefield, battlefieldSvg],
    [ASSET_IDS.blueSword, blueSwordSvg],
    [ASSET_IDS.blueBow, blueBowSvg],
    [ASSET_IDS.redSword, redSwordSvg],
    [ASSET_IDS.redBow, redBowSvg]
];

export const loadSoldierBattleStarter = async vm => {
    const storage = vm.runtime.storage;
    const encoder = new TextEncoder();
    assets.forEach(([id, svg]) => {
        storage.builtinHelper._store(
            storage.AssetType.ImageVector,
            storage.DataFormat.SVG,
            encoder.encode(svg),
            id
        );
    });
    await vm.loadProject(soldierBattleStarterProject);
};
