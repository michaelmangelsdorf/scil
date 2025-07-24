import { LlamaModel, LlamaContext, LlamaChatSession, getLlama, resolveChatWrapper } from 'node-llama-cpp';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Separate instances for inference and embedding
let llamaInference = null;
let llamaEmbedding = null;
let inferenceModel = null;
let embeddingModel = null;
let embeddingContext = null;
let initializationStatus = "pending";
let initializationPromise = null;

const inferenceModelPath = process.env.INFERENCE_MODEL_GGUF;
const embeddingModelPath = process.env.EMBEDDING_MODEL_GGUF;
const gpuLayers = process.env.GPU_LAYERS ? parseInt(process.env.GPU_LAYERS, 10) : 0;

export async function initializeModels() {
    if (initializationPromise) {
        console.log('Model initialization already in progress...');
        return initializationPromise;
    }

    if (initializationStatus !== "pending") {
        console.log('Model initialization has already been completed or failed.');
        return Promise.resolve();
    }

    initializationPromise = (async () => {
        try {
            if (!inferenceModelPath || !embeddingModelPath) {
                const warningMsg = 'INFERENCE_MODEL_GGUF and EMBEDDING_MODEL_GGUF paths must be set in .env. Local inference is disabled.';
                console.warn(warningMsg);
                initializationStatus = "failed";
                return;
            }

            // Initialize separate Llama instances
            console.log("Initializing Llama for Inference...");
            llamaInference = await getLlama();
            if (!llamaInference) throw new Error("Failed to initialize Llama instance for inference.");

            console.log("Initializing Llama for Embedding...");
            llamaEmbedding = await getLlama();
            if (!llamaEmbedding) throw new Error("Failed to initialize Llama instance for embedding.");

            console.log("Llama instances initialized.");

            const chatWrapper = await resolveChatWrapper(inferenceModelPath);
            
            const inferenceModelOptions = {
                modelPath: inferenceModelPath,
                gpuLayers: gpuLayers,
            };

            if (chatWrapper) {
                console.log(`Successfully resolved chat wrapper: ${chatWrapper.wrapper.name}`);
                inferenceModelOptions.chatWrapper = chatWrapper;
            } else {
                console.log("Could not resolve a named chat wrapper. The model will attempt to use the template from its metadata if available.");
            }

            console.log(`Loading local inference model with options:`, inferenceModelOptions);
            inferenceModel = await llamaInference.loadModel(inferenceModelOptions);
            if (!inferenceModel) throw new Error("Failed to load inference model.");
            console.log("Inference model loaded successfully.");

            const embeddingModelOptions = {
                modelPath: embeddingModelPath,
                gpuLayers: gpuLayers,
            };

            console.log(`Loading local embedding model with options:`, embeddingModelOptions);
            embeddingModel = await llamaEmbedding.loadModel(embeddingModelOptions);
            if (!embeddingModel) throw new Error("Failed to load embedding model.");

            embeddingContext = await embeddingModel.createContext({ embedding: true });
            if (!embeddingContext) throw new Error("Failed to create embedding context.");
            console.log("Embedding model and context created successfully.");

            initializationStatus = "success";
            console.log("Model initialization successful.");
        } catch (error) {
            console.error('CRITICAL: Failed to load local models:', error);
            inferenceModel = null;
            embeddingModel = null;
            embeddingContext = null;
            initializationStatus = "failed";
        } finally {
            initializationPromise = null;
        }
    })();

    return initializationPromise;
}

export function getInitializationStatus() {
    return initializationStatus;
}

export function unloadModels() {
    if (inferenceModel) {
        inferenceModel = null;
        llamaInference = null;
        console.log('Local inference model and Llama instance unloaded.');
    } else {
        console.log('Inference model was already unloaded or never initialized.');
    }

    if (embeddingModel) {
        embeddingModel = null;
        embeddingContext = null;
        llamaEmbedding = null;
        console.log('Local embedding model and Llama instance unloaded.');
    } else {
        console.log('Embedding model was already unloaded or never initialized.');
    }

    initializationStatus = "pending";
}

export async function fetchLocalModels() {
    await initializeModels();

    if (initializationStatus !== "success") {
        const errorMsg = "Model initialization failed. Check server logs for details.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    if (typeof inferenceModel?.trainContextSize !== 'number') {
        const errorMsg = "localModelService error: inferenceModel.trainContextSize is not a valid number.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    if (typeof embeddingModel?.trainContextSize !== 'number') {
        const errorMsg = "localModelService error: embeddingModel.trainContextSize is not a valid number.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    const models = [];
    if (inferenceModel && inferenceModelPath) {
        models.push({
            id: path.basename(inferenceModelPath),
            type: 'inference',
            context_length: inferenceModel.trainContextSize || 4096,
        });
    }

    if (embeddingModel && embeddingModelPath) {
        models.push({
            id: path.basename(embeddingModelPath),
            type: 'embedding',
            context_length: embeddingModel.trainContextSize || 4096,
        });
    }

    return models;
}

export const inferChat = async (messages, modelId, maxTokens = 2000) => {
    await initializeModels();

    if (initializationStatus !== "success" || !inferenceModel) {
        const errorMsg = 'Local inference model is not loaded or failed to load.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    // The chat template expects the full message history, including the system prompt.
    // We no longer separate it.
    const context = await inferenceModel.createContext();
    const session = new LlamaChatSession({
        contextSequence: context.getSequence()
    });

    try {
        console.log('--- PAYLOAD TO node-llama-cpp (inferChat) ---', JSON.stringify(messages, null, 2));
        const response = await session.prompt(messages, { maxTokens });
        return response;
    } catch (error) {
        console.error('Error during inference:', error);
        throw new Error(`Inference failed: ${error.message}`);
    }
};

export const streamInferChat = async (messages, modelId, res, maxTokens = 1000) => {
    await initializeModels();

    if (initializationStatus !== "success" || !inferenceModel) {
        const errorMsg = 'Local inference model is not loaded or failed to load.';
        console.error(errorMsg);
        res.status(500).json({ error: errorMsg });
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    try {
        // The chat template expects the full message history, including the system prompt.
        // We no longer separate it.
        const context = await inferenceModel.createContext();
        const session = new LlamaChatSession({
            contextSequence: context.getSequence()
        });

        console.log('--- PAYLOAD TO node-llama-cpp (streamInferChat) ---', JSON.stringify(messages, null, 2));
        const stream = await session.prompt(messages, { maxTokens });

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
    } catch (error) {
        console.error('Error during local stream inference:', error);
        res.write(`data: ${JSON.stringify({ error: 'Local stream error', message: error.message })}\n\n`);
    } finally {
        res.write('data: [DONE]\n\n');
        res.end();
    }
};

export const getEmbedding = async (input, modelId) => {
    await initializeModels();

    if (initializationStatus !== "success" || !embeddingContext) {
        const errorMsg = 'Local embedding model is not loaded or failed to create an embedding context.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    try {
        const embedding = await embeddingContext.getEmbedding(input);
        return embedding.vector;
    } catch (error) {
        console.error('Error during embedding retrieval:', error);
        throw new Error(`Embedding retrieval failed: ${error.message}`);
    }
};