import {getScratchProjectId} from '../../../src/lib/scratch-project-url';

describe('getScratchProjectId', () => {
    test.each([
        ['65347738', '65347738'],
        ['https://scratch.mit.edu/projects/65347738/', '65347738'],
        ['https://www.scratch.mit.edu/projects/65347738', '65347738']
    ])('accepts %s', (input, expected) => {
        expect(getScratchProjectId(input)).toBe(expected);
    });

    test.each([
        'http://scratch.mit.edu/projects/65347738',
        'https://scratch.mit.edu.evil.example/projects/65347738',
        'https://scratch.mit.edu/users/ada/projects/65347738',
        'https://scratch.mit.edu/projects/not-a-number'
    ])('rejects %s', input => {
        expect(() => getScratchProjectId(input)).toThrow('invalid_scratch_project_url');
    });
});
