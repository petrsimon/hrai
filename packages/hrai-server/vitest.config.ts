import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Model calls are slow; a 14B diagnosis runs 2-7s and the suite runs several.
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
