const PROJECT_ID = /^\d{1,20}$/;
const SCRATCH_HOSTS = new Set(['scratch.mit.edu', 'www.scratch.mit.edu']);

/**
 * Extracts a Scratch project ID from a shared project URL or a bare ID.
 * @param {string} input URL or project ID entered by the learner.
 * @returns {string} Numeric project ID.
 * @throws {Error} When the input is not a Scratch project URL or ID.
 */
const getScratchProjectId = input => {
    const value = input.trim();
    if (PROJECT_ID.test(value)) return value;

    let url;
    try {
        url = new URL(value);
    } catch (error) {
        throw new Error('invalid_scratch_project_url', {cause: error});
    }

    const match = /^\/projects\/(\d{1,20})\/?$/.exec(url.pathname);
    if (url.protocol !== 'https:' || !SCRATCH_HOSTS.has(url.hostname) || !match) {
        throw new Error('invalid_scratch_project_url');
    }
    return match[1];
};

export {getScratchProjectId};
