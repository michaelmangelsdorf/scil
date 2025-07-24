// vector-expert/public/api-service.js

import { setAvailableModels } from './dom-elements.js';

// Generic stream reader function (copied from basic-inference/public/api-service.js)
const readStream = async (response, onChunk, onComplete, onError) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n\n')) !== -1) {
                const message = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 2);

                if (message.startsWith('data: ')) {
                    const jsonString = message.substring(6).trim(); // Trim whitespace

                    // Check for [DONE] message before attempting to parse
                    if (jsonString === '[DONE]') {
                        console.log('Stream received [DONE] signal.');
                        onComplete(); // Signal completion
                        reader.cancel(); // Close the reader
                        return; // Exit the function
                    }

                    try {
                        const parsedData = JSON.parse(jsonString);
                        if (parsedData.error) {
                            onError(new Error(parsedData.message || 'Stream error'));
                            reader.cancel();
                            return;
                        }
                        if (parsedData.content) {
                            onChunk(parsedData.content);
                        }
                    } catch (e) {
                        console.error('Error parsing stream JSON:', e);
                        onError(new Error('Failed to parse stream data.'));
                        reader.cancel();
                        return;
                    }
                }
            }
        }
        // If the loop finishes without a [DONE] signal, still call onComplete
        onComplete();
    } catch (error) {
        console.error('Stream reading error:', error);
        onError(error);
    }
};


/**
 * Fetches available LM Studio models from the backend.
 * @returns {Object} An object containing available models data and preferred model IDs.
 */
export async function fetchModelsApi() {
    const response = await fetch('/vector-expert/api/lm-studio/models');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const responseData = await response.json();
    // Set the available models in global state from the 'data' property of the response
    setAvailableModels(responseData.data); 
    // Return the entire responseData object, which includes preferredModelId
    return responseData; 
}

/**
 * Fetches all available scenes from the backend.
 * @returns {Array} An array of scene objects.
 */
export async function fetchScenesApi() {
    const response = await fetch(`/vector-expert/api/scenes`);
    if (!response.ok) throw new Error('Failed to fetch scenes');
    return await response.json();
}

/**
 * Fetches all available agents from the backend.
 * @returns {Array} An array of agent objects.
 */
export async function fetchAgentsApi() {
    const response = await fetch(`/vector-expert/api/agents`);
    if (!response.ok) {
        // MODIFIED: Read the error response body to get the detailed error message
        const errorData = await response.json().catch(() => ({ error: 'Unknown error fetching agents' }));
        throw new Error(errorData.error || `Failed to fetch agents with status: ${response.status}`);
    }
    return await response.json();
}

/**
 * Generates an embedding for content and stores it in the database.
 * @param {string} content The text content to embed.
 * @param {number|null} sceneId The ID of the associated scene (optional).
 * @param {number|null} agentId The ID of the associated agent (optional).
 * @param {string} modelId The ID of the embedding model to use.
 * @returns {Object} The response from the server.
 */
export async function generateAndStoreEmbeddingApi(content, sceneId, agentId, modelId) {
    const response = await fetch('/vector-expert/api/embeddings/generate-and-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, scene_id: sceneId, agent_id: agentId, model_id: modelId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to store embedding.');
    }
    return await response.json();
}

/**
 * NEW: Fetches a raw embedding for a given text from LM Studio via the backend.
 * This is used for testing model usability.
 * (Now uses centralized embedding service)
 */
export async function getRawEmbeddingApi(inputText, modelId) {
    const response = await fetch('/vector-expert/api/embeddings/get-raw-embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText, model_id: modelId }),
    });

    if (!response.ok) {
        const errorText = await response.text(); // Get raw text for debugging
        console.error('API Error Response (Raw Text):', errorText);
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            throw new Error(`HTTP error! status: ${response.status}. Response was not valid JSON: ${errorText.substring(0, 200)}...`);
        }
        throw new Error(errorData.error || `Failed to get raw embedding for testing. Status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.embedding)) {
        console.error('Unexpected response data for raw embedding:', data);
        throw new Error('Backend did not return an array for "embedding".');
    }
    return data.embedding; // Expecting the raw embedding array
}

/**
 * Performs a vector search for a query text.
 * @param {string} queryText The text to query for.
 * @param {string} modelId The ID of the embedding model to use for the query.
 * @param {number} kNeighbors The number of nearest neighbors to retrieve.
 * @returns {Object} The search results from the server.
 */
export async function queryEmbeddingsApi(queryText, modelId, kNeighbors = 5) {
    const response = await fetch('/vector-expert/api/embeddings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_text: queryText, model_id: modelId, k_neighbors: kNeighbors }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to perform vector search.');
    }
    return await response.json();
}

/**
 * Triggers the backend to generate and store embeddings for all dialogs.
 * @param {string} modelId The ID of the embedding model to use.
 * @returns {Object} The response from the server.
 */
export async function teachDialogsApi(modelId) {
    const response = await fetch('/vector-expert/api/embeddings/teach-dialogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to teach dialogs.');
    }
    return await response.json();
}

/**
 * NEW: Sends an inference query to LM Studio using a Playwright agent's prompt and dynamic context.
 * This is the non-streaming version (kept for reference, but streaming will be used).
 * @param {string} playwrightAgentId The ID of the Playwright agent.
 * @param {string} selectedModelId The ID of the LM Studio model to use for inference.
 * @param {string} userQuery The user's query/input.
 * @param {number|null} selectedSceneId The ID of the selected scene, or null.
 * @param {number|null} selectedAgentId The ID of the selected agent, or null.
 * @returns {Object} The inference response from the backend.
 */
export async function sendPlaywrightInferenceQuery(playwrightAgentId, selectedModelId, userQuery, selectedSceneId, selectedAgentId) {
    const response = await fetch('/vector-expert/api/playwright-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playwright_agent_id: playwrightAgentId,
            model_id: selectedModelId,
            user_query: userQuery,
            scene_id: selectedSceneId,
            agent_id: selectedAgentId
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to perform Playwright inference.');
    }
    return await response.json();
}

/**
 * NEW: Streams an inference query to LM Studio using a Playwright agent's prompt and dynamic context.
 * @param {string} playwrightAgentId The ID of the Playwright agent.
 * @param {string} selectedModelId The ID of the LM Studio model to use for inference.
 * @param {string} userQuery The user's query/input.
 * @param {function} onChunk Callback for each chunk of streamed content.
 * @param {function} onComplete Callback when the stream is complete.
 * @param {function} onError Callback if an error occurs during streaming.
 * @param {number|null} selectedSceneId The ID of the selected scene, or null.
 * @param {number|null} selectedAgentId The ID of the selected agent, or null.
 */
export async function sendPlaywrightInferenceQueryStreaming(
    playwrightAgentId,
    selectedModelId,
    userQuery,
    onChunk,
    onComplete,
    onError,
    selectedSceneId = null,
    selectedAgentId = null
) {
    try {
        const response = await fetch('/vector-expert/api/playwright-inference-stream', { // NEW STREAMING ENDPOINT
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playwright_agent_id: playwrightAgentId,
                model_id: selectedModelId,
                user_query: userQuery,
                scene_id: selectedSceneId,
                agent_id: selectedAgentId
            }),
        });

        if (!response.ok) {
            const errorText = await response.text(); // Get raw text for robust error handling
            let errorMessage = `HTTP error! status: ${response.status}`;
            let detailsMessage = '';

            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
                detailsMessage = errorData.details || '';
            } catch (e) {
                // If response is not JSON, use the raw text as part of the error
                detailsMessage = `Response: "${errorText.substring(0, 100)}..."`;
            }
            throw new Error(`${errorMessage} ${detailsMessage}`.trim()); // Combine for comprehensive message
        }

        if (!response.body) {
            throw new Error("Response body is null. Streaming not supported.");
        }

        await readStream(response, onChunk, onComplete, onError);

    } catch (error) {
        console.error('Error in sendPlaywrightInferenceQueryStreaming:', error);
        onError(error);
    }
}