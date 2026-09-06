import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {defaultModelRef} from "./pi-runtime.ts";

export interface ProviderModelInfo {
    id: string;
    name: string;
    reasoning: boolean;
}

export interface ProviderInfo {
    id: string;
    name: string;
    /** Whether the profile has credentials for this provider, so its models can be picked. */
    configured: boolean;
    /** Whether the credentials are a subscription rather than a metered key. */
    subscription: boolean;
    /** Which login flows the provider offers; a local server offers none and needs none. */
    login: {oauth: boolean; apiKey: boolean};
    models: ProviderModelInfo[];
}

export interface ModelCatalog {
    default: string;
    providers: ProviderInfo[];
}

/**
 * The providers and models a profile can choose from.
 *
 * Every registered provider is listed, configured or not, because the settings dialog is where
 * a child logs in to one; hiding unconfigured providers would hide the login button with them.
 * @param runtime The profile's runtime.
 * @returns The catalogue, with the server's default model reference.
 */
export async function listProviders(runtime: ModelRuntime): Promise<ModelCatalog> {
    const available = new Set((await runtime.getAvailable()).map((model) => `${model.provider}/${model.id}`));
    const providers = runtime.getProviders()
        .map((provider): ProviderInfo => ({
            id: provider.id,
            name: provider.name,
            configured: runtime.hasConfiguredAuth(provider.id),
            subscription: runtime.isUsingSubscription(provider.id),
            login: {
                oauth: provider.auth.oauth !== undefined,
                apiKey: provider.auth.apiKey?.login !== undefined,
            },
            models: runtime.getModels(provider.id)
                .filter((model) => available.has(`${model.provider}/${model.id}`) || !runtime.hasConfiguredAuth(provider.id))
                .map((model) => ({id: model.id, name: model.name, reasoning: model.reasoning})),
        }))
        .filter((provider) => provider.models.length > 0)
        .sort((left, right) => Number(right.configured) - Number(left.configured) || left.name.localeCompare(right.name));
    return {default: defaultModelRef(), providers};
}
