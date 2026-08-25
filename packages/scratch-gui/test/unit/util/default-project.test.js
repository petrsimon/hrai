import defaultProjectGenerator from '../../../src/lib/default-project/index';

describe('defaultProject', () => {
    // This test ensures that the assets referenced in the default project JSON
    // do not get out of sync with the raw assets that are included alongside.
    // see https://github.com/LLK/scratch-gui/issues/4844
    test('assets referenced by the project are included', () => {
        const translatorFn = () => '';
        const defaultProject = defaultProjectGenerator(translatorFn);
        const includedAssetIds = defaultProject.map(obj => obj.id);
        const projectData = JSON.parse(defaultProject[0].data);
        projectData.targets.forEach(target => {
            target.costumes.forEach(costume => {
                expect(includedAssetIds.includes(costume.assetId)).toBe(true);
            });
            target.sounds.forEach(sound => {
                expect(includedAssetIds.includes(sound.assetId)).toBe(true);
            });
        });
    });

    test('uses the HRAI dragon and its animation frame for the default sprite', () => {
        const defaultProject = defaultProjectGenerator(() => '');
        const projectData = JSON.parse(defaultProject[0].data);
        const sprite = projectData.targets.find(target => !target.isStage);

        expect(sprite.costumes).toHaveLength(4);
        expect(sprite.costumes.map(costume => costume.assetId)).toEqual([
            '7f91a8cc4db049d193145cda079a510f',
            '42217ca144971f0aa71196ebedec7b80',
            '855d408d8dc17bad4865480447674fc9',
            '4375d2db113110fd1b242e50da526496'
        ]);
        expect(sprite.costumes.every(costume => costume.dataFormat === 'png')).toBe(true);
        expect(sprite.costumes.every(costume => costume.bitmapResolution === 2)).toBe(true);
    });
});
