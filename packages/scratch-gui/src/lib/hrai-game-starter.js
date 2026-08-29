/**
 * Installs the server-created prototype into the current Scratch project.
 * Assets stay local to the editor; only names, variables, and block graphs come
 * from the starter, so a model never needs to manufacture binary assets.
 * @param {object} vm Scratch VM instance.
 * @param {{targets: Array}} starter Normalized starter block graphs.
 * @returns {Promise<void>} Resolves after the VM has loaded the prototype.
 */
export const loadGameStarter = async (vm, starter) => {
    if (!starter || !Array.isArray(starter.targets)) {
        throw new Error('HRAI game starter is invalid');
    }

    const serializedProject = vm.toJSON();
    const project = typeof serializedProject === 'string' ? JSON.parse(serializedProject) : serializedProject;
    const stage = project.targets.find(target => target.isStage);
    const sprites = project.targets.filter(target => !target.isStage);
    let spriteIndex = 0;
    const replacements = new Map();

    starter.targets.forEach(starterTarget => {
        const source = starterTarget.isStage ? stage : sprites[spriteIndex++];
        if (!source) {
            throw new Error('HRAI game starter needs more editor targets');
        }
        replacements.set(source, {
            ...source,
            name: starterTarget.name,
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: starterTarget.blocks,
            comments: {},
            ...(starterTarget.isStage ? {} : {x: -120, y: 0})
        });
    });

    await vm.loadProject({...project, targets: project.targets.map(target => replacements.get(target) || target)});
};
