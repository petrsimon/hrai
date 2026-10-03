const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

type Fetch = typeof fetch;

async function readLimitedBody(response: Response): Promise<Uint8Array> {
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PROJECT_BYTES) {
        throw new Error("scratch_project_too_large");
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("scratch_project_too_large");
        return bytes;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PROJECT_BYTES) {
            await reader.cancel();
            throw new Error("scratch_project_too_large");
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks, size);
}

/**
 * Downloads a shared Scratch project's SB3 data without using a Scratch account credential.
 * @param projectId Numeric Scratch project ID.
 * @param fetcher Fetch implementation, replaceable at the network seam in tests.
 * @returns Compressed project bytes.
 */
export async function downloadPublicScratchProject(projectId: string, fetcher: Fetch = fetch): Promise<Uint8Array> {
    if (!/^\d{1,20}$/.test(projectId)) throw new Error("invalid_scratch_project_id");

    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const metadataResponse = await fetcher(`https://api.scratch.mit.edu/projects/${projectId}`, {signal});
    if (metadataResponse.status === 404) throw new Error("scratch_project_not_found");
    if (!metadataResponse.ok) throw new Error("scratch_project_unavailable");

    const metadata: unknown = await metadataResponse.json();
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
        throw new Error("scratch_project_unavailable");
    }
    const project = metadata as Record<string, unknown>;
    if (project.public !== true || typeof project.project_token !== "string" || project.project_token.length === 0) {
        throw new Error("scratch_project_not_public");
    }

    const downloadUrl = new URL(`https://projects.scratch.mit.edu/${projectId}`);
    downloadUrl.searchParams.set("token", project.project_token);
    const projectResponse = await fetcher(downloadUrl, {signal});
    if (projectResponse.status === 404 || projectResponse.status === 403) {
        throw new Error("scratch_project_not_public");
    }
    if (!projectResponse.ok) throw new Error("scratch_project_download_failed");

    return readLimitedBody(projectResponse);
}
