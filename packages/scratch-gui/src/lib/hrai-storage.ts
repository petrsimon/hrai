/* eslint-disable arrow-parens */
import {LegacyStorage} from './legacy-storage';
import {GUIStorage, ProjectId} from '../gui-config';

declare const process: {env: {HRAI_SERVER_URL?: string}};

const getApiBase = () => {
    if (typeof process !== 'undefined' && process.env.HRAI_SERVER_URL) return process.env.HRAI_SERVER_URL;
    return typeof window === 'object' ? window.location.origin : 'http://localhost:8791';
};

const jsonHeaders = {'Content-Type': 'application/json'};

/**
 * HRAI's project adapter keeps the upstream Scratch storage contract while routing
 * authenticated writes and private assets to the self-hosted HRAI server. Scratch
 * web stores remain as fallbacks, so public Scratch projects can still be opened.
 */
export class HraiStorage implements GUIStorage {
    private readonly legacyStorage = new LegacyStorage();
    private readonly apiBase = getApiBase().replace(/\/$/, '');

    readonly scratchStorage = this.legacyStorage.scratchStorage;
    constructor () {
        const webHelper = this.scratchStorage.webHelper;
        // HRAI writes must never fall through to Scratch's authenticated upload store.
        // Keep those stores available for public reads only.
        webHelper.stores.forEach(store => {
            if (store.types.includes(this.scratchStorage.AssetType.ImageVector.name) ||
                store.types.includes(this.scratchStorage.AssetType.ImageBitmap.name) ||
                store.types.includes(this.scratchStorage.AssetType.Sound.name)) {
                delete store.create;
                delete store.update;
            }
        });
        webHelper.stores.unshift({
            types: [this.scratchStorage.AssetType.Project.name],
            get: asset => `${this.apiBase}/api/projects/${asset.assetId}`,
            create: () => ({
                url: `${this.apiBase}/api/projects`,
                withCredentials: true
            }),
            update: asset => ({
                url: `${this.apiBase}/api/projects/${asset.assetId}`,
                withCredentials: true
            })
        });
        webHelper.stores.unshift({
            types: [
                this.scratchStorage.AssetType.ImageVector.name,
                this.scratchStorage.AssetType.ImageBitmap.name,
                this.scratchStorage.AssetType.Sound.name
            ],
            get: asset => `${this.apiBase}/api/assets/${asset.assetId}.${asset.dataFormat}`,
            create: asset => ({
                url: `${this.apiBase}/api/assets/${asset.assetId}.${asset.dataFormat}`,
                withCredentials: true
            }),
            update: asset => ({
                url: `${this.apiBase}/api/assets/${asset.assetId}.${asset.dataFormat}`,
                withCredentials: true
            })
        });
    }

    setProjectHost (host: string): void {
        this.legacyStorage.setProjectHost(host);
    }

    setProjectToken (token: string): void {
        this.legacyStorage.setProjectToken(token);
    }

    setProjectMetadata (projectId: string | null | undefined): void {
        this.legacyStorage.setProjectMetadata(projectId);
    }

    setAssetHost (host: string): void {
        this.legacyStorage.setAssetHost(host);
    }

    setTranslatorFunction (translator): void {
        this.legacyStorage.setTranslatorFunction(translator);
    }

    setBackpackHost (host: string): void {
        this.legacyStorage.setBackpackHost(host);
    }

    getLibraryAssetUrl (assetId: string, dataFormat: string): string {
        return this.legacyStorage.getLibraryAssetUrl(assetId, dataFormat);
    }

    async saveProject (
        projectId: ProjectId | null | undefined,
        vmState: string,
        params: {originalId?: ProjectId; isCopy?: boolean | 1; isRemix?: boolean | 1; title?: string}
    ): Promise<{id: ProjectId}> {
        const path = projectId === null || typeof projectId === 'undefined' ?
            '/api/projects' : `/api/projects/${projectId}`;
        const response = await fetch(`${this.apiBase}${path}`, {
            method: projectId === null || typeof projectId === 'undefined' ? 'POST' : 'PUT',
            credentials: 'include',
            headers: jsonHeaders,
            body: JSON.stringify({
                state: vmState,
                title: params.title,
                originalId: params.originalId,
                isCopy: params.isCopy,
                isRemix: params.isRemix
            })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `project_save_failed_${response.status}`);
        }
        const saved = await response.json();
        return {id: saved.id};
    }
}
