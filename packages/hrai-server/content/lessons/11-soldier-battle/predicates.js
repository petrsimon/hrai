const blocksIn = project => (project.targets || []).flatMap(target => Object.values(target.blocks || {}));

const blocksInTarget = target => Object.values(target.blocks || {});

const targetsIn = project => project.targets || [];

const hasOpcode = (project, opcode) => blocksIn(project).some(block => block.opcode === opcode);

const hasAnyOpcode = (project, opcodes) => opcodes.some(opcode => hasOpcode(project, opcode));

const variableName = variable => Array.isArray(variable) ? variable[0] : variable?.name;

const hasVariable = (project, name) => targetsIn(project).some(target => (
    Object.values(target.variables || {}).some(variable => variableName(variable) === name)
));

const hasAllVariables = (project, names) => names.every(name => hasVariable(project, name));

const hasSelectionVariable = project => ['vybraný voják', 'selected soldier'].some(name => hasVariable(project, name));

const targetHasAllOpcodes = (target, opcodes) => opcodes.every(opcode => (
    blocksInTarget(target).some(block => block.opcode === opcode)
));

const selectionVisualOpcodes = ['looks_seteffectto', 'looks_changeeffectby', 'looks_switchcostumeto'];

export const predicates = {
    board: project => targetsIn(project).filter(target => !target.isStage).length >= 4,

    selectionClick: project => targetsIn(project).some(target => (
        !target.isStage && targetHasAllOpcodes(target, ['event_whenthisspriteclicked'])
    )),

    selectionMemory: project => hasSelectionVariable(project) && targetsIn(project).some(target => (
        !target.isStage && targetHasAllOpcodes(target, [
            'event_whenthisspriteclicked',
            'data_setvariableto'
        ])
    )),

    selectionMark: project => hasSelectionVariable(project) && targetsIn(project).some(target => (
        !target.isStage &&
        targetHasAllOpcodes(target, ['event_whenthisspriteclicked', 'data_setvariableto']) &&
        selectionVisualOpcodes.some(opcode => blocksInTarget(target).some(block => block.opcode === opcode))
    )),

    swordAttack: project => (
        hasOpcode(project, 'event_whenthisspriteclicked') &&
        hasOpcode(project, 'control_if') &&
        hasAnyOpcode(project, ['operator_lt', 'operator_equals'])
    ),

    healthAndDeath: project => (
        hasVariable(project, 'health') &&
        hasAllVariables(project, ['dead enemies', 'living enemies']) &&
        hasOpcode(project, 'looks_hide')
    ),

    bowAttack: project => (
        hasOpcode(project, 'sensing_distanceto') &&
        hasVariable(project, 'type')
    ),

    reinforcements: project => (
        hasOpcode(project, 'control_create_clone_of') &&
        hasOpcode(project, 'control_wait') &&
        hasVariable(project, 'reinforcements')
    ),

    result: project => (
        hasOpcode(project, 'event_broadcast') &&
        hasOpcode(project, 'event_whenbroadcastreceived') &&
        hasOpcode(project, 'operator_gt') &&
        hasOpcode(project, 'looks_say')
    )
};

export default predicates;
