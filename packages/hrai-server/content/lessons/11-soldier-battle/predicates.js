const blocksIn = project => (project.targets || []).flatMap(target => Object.values(target.blocks || {}));

const targetsIn = project => project.targets || [];

const hasOpcode = (project, opcode) => blocksIn(project).some(block => block.opcode === opcode);

const hasAnyOpcode = (project, opcodes) => opcodes.some(opcode => hasOpcode(project, opcode));

const hasVariable = (project, name) => targetsIn(project).some(target => (
    Object.values(target.variables || {}).some(variable => variable[0] === name)
));

const hasAllVariables = (project, names) => names.every(name => hasVariable(project, name));

export const predicates = {
    board: project => targetsIn(project).filter(target => !target.isStage).length >= 4,

    selection: project => (
        hasOpcode(project, 'event_whenthisspriteclicked') &&
        hasVariable(project, 'selected soldier')
    ),

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
