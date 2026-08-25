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

        expect(sprite.costumes).toHaveLength(2);
        expect(sprite.costumes.map(costume => costume.assetId)).toEqual([
            '4588e7e83273b7f3831be57b7cdcb7c3',
            '920e898fb4ff2716f9eb8a71d77f5346'
        ]);
        expect(sprite.costumes.every(costume => costume.dataFormat === 'png')).toBe(true);
    });
});
