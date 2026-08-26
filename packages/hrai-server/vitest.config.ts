import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Model calls are slow: a 14B diagnosis runs several seconds and the suite runs many.
        testTimeout: 180_000,
        hookTimeout: 180_000,
        // One local model server answers one request at a time, so parallel test files do
        // not run in parallel — they queue, and then blow their timeouts waiting. Running
        // files serially makes the suite honest about a constraint it cannot escape.
        fileParallelism: false,
    },
});
