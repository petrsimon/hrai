import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useState} from 'react';
import VM from '@scratch/scratch-vm';

import Box from '../box/box.jsx';

import styles from './hrai-panel.css';

const getEditingTargetOpcodes = vm => {
    const target = vm.editingTarget;
    if (!target || !target.blocks) {
        return [];
    }

    const blocks = target.blocks._blocks;
    const opcodes = [];
    const seen = new Set();

    for (const blockId of Object.keys(blocks)) {
        const opcode = blocks[blockId].opcode;
        if (!seen.has(opcode)) {
            seen.add(opcode);
            opcodes.push(opcode);
        }
    }

    opcodes.sort();
    return opcodes;
};

const HraiPanel = ({vm}) => {
    const [opcodes, setOpcodes] = useState(() => getEditingTargetOpcodes(vm));

    const refreshOpcodes = useCallback(() => {
        setOpcodes(getEditingTargetOpcodes(vm));
    }, [vm]);

    useEffect(() => {
        refreshOpcodes();
        vm.addListener('workspaceUpdate', refreshOpcodes);
        vm.addListener('targetsUpdate', refreshOpcodes);

        return () => {
            vm.removeListener('workspaceUpdate', refreshOpcodes);
            vm.removeListener('targetsUpdate', refreshOpcodes);
        };
    }, [vm, refreshOpcodes]);

    const spriteName = vm.editingTarget ?
        vm.editingTarget.sprite.name :
        'No sprite selected';

    return (
        <Box
            className={styles.hraiPanel}
            element="aside"
            role="complementary"
            aria-label="hrai panel"
        >
            <h2>hrai</h2>
            <p>{spriteName}</p>
            {opcodes.length > 0 ? (
                <ul className={styles.opcodeList}>
                    {opcodes.map(opcode => (
                        <li key={opcode}>{opcode}</li>
                    ))}
                </ul>
            ) : (
                <p className={styles.emptyState}>No blocks on this sprite.</p>
            )}
        </Box>
    );
};

HraiPanel.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default HraiPanel;
