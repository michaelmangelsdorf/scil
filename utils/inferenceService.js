// utils/inferenceService.js
import { dbGet } from './db.js';
import * as lmStudioService from './lmStudioService.js';
import * as localModelService from './localModelService.js';

// A cache for the model setting to avoid frequent DB lookups.
// It will be updated when the setting changes in the settings panel.
let useLmStudio = null;

const getModelService = async () => {
    // If the setting is not cached, fetch it from the database.
    if (useLmStudio === null) {
        try {
            const setting = await dbGet("SELECT value FROM state WHERE domain = 'models' AND key = 'use_lm_studio'");
            useLmStudio = setting ? setting.value === 'true' : false; // Default to false if not set
        } catch (error) {
            console.error('Error fetching model setting, defaulting to local models:', error);
            useLmStudio = false;
        }
    }
    return useLmStudio ? lmStudioService : localModelService;
};

// --- NEW: Expose local model status and current mode ---
export const getLocalModelInitStatus = () => {
    return localModelService.getInitializationStatus();
};

export const isUsingLmStudio = async () => {
    if (useLmStudio === null) {
        await getModelService(); // This will populate the useLmStudio cache
    }
    return useLmStudio;
};


// --- Abstraction Functions ---

export const fetchModels = async () => {
    const service = await getModelService();
    // The fetchModels function now also needs to return the preferred models from .env
    // This logic is slightly different for local vs lm-studio, so we handle it here.
    if (useLmStudio) {
        const models = await service.fetchLmStudioModels();
        return {
            data: models.data,
            preferredInferenceModelId: process.env.INFERENCE_MODEL_ID || null,
            preferredEmbeddingModelId: process.env.EMBEDDING_MODEL_ID || null,
        };
    } else {
        // For local models, the "available" models ARE the preferred models.
        const localModels = await service.fetchLocalModels();
        return {
            data: localModels, // data will be an array like [{id: 'model-name.gguf', ...}]
            preferredInferenceModelId: localModels.find(m => m.type === 'inference')?.id || null,
            preferredEmbeddingModelId: localModels.find(m => m.type === 'embedding')?.id || null,
        };
    }
};

export const inferChat = async (messages, modelId, maxTokens) => {
    const service = await getModelService();
    // The function name in lmStudioService is also `inferChat`.
    // The function name in localModelService will be `inferChat`.
    return service.inferChat(messages, modelId, maxTokens);
};

export const streamInferChat = async (messages, modelId, res, maxTokens) => {
    const service = await getModelService();
    return service.streamInferChat(messages, modelId, res, maxTokens);
};

export const getEmbedding = async (input, modelId) => {
    const service = await getModelService();
    return service.getEmbedding(input, modelId);
};

// Function to manually update the cached setting when it's changed in the UI.
// This will be called from the settings app's backend.
export const updateModelSetting = (newValue) => {
    useLmStudio = newValue;
    console.log(`Inference service setting updated to useLmStudio: ${useLmStudio}`);
    // When switching, we might need to unload/load local models.
    if (!useLmStudio) {
        localModelService.initializeModels(); // Tell local service to load models if it hasn't.
    } else {
        localModelService.unloadModels(); // Tell local service to free up memory.
    }
};
