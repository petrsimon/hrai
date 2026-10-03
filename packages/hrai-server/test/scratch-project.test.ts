import {describe, expect, it, vi} from "vitest";
import {downloadPublicScratchProject} from "../src/scratch-project.ts";

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
}

describe("public Scratch project import", () => {
    it("downloads a shared project using its public project token, without account credentials", async () => {
        const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const fetcher = vi.fn((input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
            const url = requestUrl(input);
            if (url === "https://api.scratch.mit.edu/projects/65347738") {
                return Promise.resolve(new Response(JSON.stringify({public: true, project_token: "public-token"}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"},
                }));
            }
            if (url === "https://projects.scratch.mit.edu/65347738?token=public-token") {
                return Promise.resolve(new Response(bytes, {
                    status: 200,
                    headers: {"Content-Type": "application/octet-stream"},
                }));
            }
            return Promise.reject(new Error(`Unexpected Scratch URL: ${url}`));
        });

        const project = await downloadPublicScratchProject("65347738", fetcher);

        expect([...project]).toEqual([...bytes]);
        expect(fetcher).toHaveBeenCalledTimes(2);
        const [metadataRequest, archiveRequest] = fetcher.mock.calls;
        if (!metadataRequest || !archiveRequest) throw new Error("expected two Scratch requests");
        expect(requestUrl(metadataRequest[0])).toBe("https://api.scratch.mit.edu/projects/65347738");
        expect(requestUrl(archiveRequest[0])).toBe("https://projects.scratch.mit.edu/65347738?token=public-token");
        expect(fetcher.mock.calls.every(([, options]) => options?.headers === undefined)).toBe(true);
    });

    it("does not fetch an unshared project", async () => {
        const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({public: false}), {status: 200})));

        await expect(downloadPublicScratchProject("65347738", fetcher)).rejects.toThrow("scratch_project_not_public");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("rejects values that are not Scratch project IDs before making a request", async () => {
        const fetcher = vi.fn();

        await expect(downloadPublicScratchProject("../65347738", fetcher)).rejects.toThrow("invalid_scratch_project_id");
        expect(fetcher).not.toHaveBeenCalled();
    });
});
