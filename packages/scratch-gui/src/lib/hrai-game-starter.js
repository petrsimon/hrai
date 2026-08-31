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
    const lastLayerOrder = Math.max(0, ...sprites.map(target => target.layerOrder || 0));
    let spriteIndex = 0;
    const replacements = new Map();
    const additions = [];

    starter.targets.forEach(starterTarget => {
        const existingSprite = starterTarget.isStage ? null : sprites[spriteIndex++];
        const source = starterTarget.isStage ? stage : existingSprite || sprites[0];
        if (!source) {
            throw new Error('HRAI game starter needs a stage and at least one sprite');
        }
        const replacement = {
            ...source,
            name: starterTarget.name,
            variables: starterTarget.variables || {},
            lists: {},
            broadcasts: {},
            blocks: starterTarget.blocks,
            comments: {},
            ...(starterTarget.isStage ? {} : {
                x: starterTarget.x ?? -120,
                y: starterTarget.y ?? 0
            })
        };
        if (starterTarget.isStage || existingSprite) {
            replacements.set(source, replacement);
        } else {
            additions.push({
                ...replacement,
                layerOrder: lastLayerOrder + additions.length + 1
            });
        }
    });

    await vm.loadProject({
        ...project,
        targets: [
            ...project.targets.map(target => replacements.get(target) || target),
            ...additions
        ],
        monitors: Array.isArray(starter.monitors) ? starter.monitors : project.monitors
    });
};
