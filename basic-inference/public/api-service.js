// basic-inference/public/api-service.js

const API_BASE_URL = ''; // Your API base URL, typically empty for same-origin or '/api'

export const fetchModelsApi = async () => {
    // Models are now fetched from the main basic-inference app's endpoint
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/lm-studio/models`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    // Expecting an object with 'data', 'preferredInferenceModelId', 'preferredEmbeddingModelId'
    return await response.json(); // Return the full object
};

export const fetchScenesApi = async () => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/scenes`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

// NEW: Fetch agents for the dropdowns
export async function fetchAgentsApi() {
    // Fetch agents of type 'Person'
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/agents?type=Person`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}


export const fetchAgentDetailsApi = async (name) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/agent-details/${encodeURIComponent(name)}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchUserAgentDetailsApi = async (name) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/agent-details/${encodeURIComponent(name)}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchSceneDialogsApi = async (sceneId) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/dialogs/all/${encodeURIComponent(sceneId)}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};


// RENAMED: saveNewDialogApi to saveDialogApi, now handles update via ID
export const saveDialogApi = async (dialogData) => {
    // BUG FIX: Always use 'POST'. The backend route at '/api/dialogs' is configured
    // in basic-inference/routes/apiRoutes.js to handle both inserts (no ID) and
    // updates (with ID) via the POST method. Using PUT was causing a 404 error for updates.
    const method = 'POST';
    const endpoint = `${API_BASE_URL}/basic-inference/api/dialogs`;

    const response = await fetch(endpoint, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dialogData),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! status: ${response.status}, Details: ${errorData.error || 'Unknown error'}`);
    }
    return response.json();
};

// NEW: API call to delete a dialog
export const deleteDialogApi = async (dialogId) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/dialogs/${encodeURIComponent(dialogId)}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! status: ${response.status}, Details: ${errorData.error || 'Unknown error'}`);
    }
    return response.json();
};

// Generic stream reader for inference APIs
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

// Non-streaming version for the first 'Play' inference (play_prompt)
export const playInferenceApiNonStreaming = async (payload) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // Expect a JSON response, not a stream
};

// NEW: Streaming version for the 'Play' inference (play_prompt)
export const playInferenceApiStreaming = async (payload, onChunk, onComplete, onError) => {
    try {
        const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/play-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
        console.error('Error in playInferenceApiStreaming:', error);
        onError(error);
    }
};


// Used as checker, streams
export const checkerInferenceApi = async (payload, onChunk, onComplete, onError) => {
    try {
        const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error("Response body is null. Streaming not supported.");
        }

        await readStream(response, onChunk, onComplete, onError);

    } catch (error) {
        console.error('Error in checkerInferenceApi:', error);
        onError(error);
    }
};

// For non-streaming inferences like Think, Plan (Wonder will now stream)
const runNonStreamingInference = async (endpoint, payload) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const thinkInferenceApi = async (payload) => {
    return runNonStreamingInference('think', payload);
};

export const planInferenceApi = async (payload) => {
    return runNonStreamingInference('plan', payload);
};

// --- MODIFIED: wonderInferenceApi to support streaming ---
export const wonderInferenceApi = async (payload, onChunk, onComplete, onError) => {
    try {
        const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/wonder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error("Response body is null. Streaming not supported.");
        }

        await readStream(response, onChunk, onComplete, onError);

    } catch (error) {
        console.error('Error in wonderInferenceApi:', error);
        onError(error);
    }
};

// NEW: Streaming version for the 'Auto' inference
export const autoInferenceApiStreaming = async (payload, onChunk, onComplete, onError) => {
    try {
        const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/auto-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
        console.error('Error in autoInferenceApiStreaming:', error);
        onError(error);
    }
};

// NEW: Streaming version for 'Evolve' inference
export const evolveInferenceApi = async (payload, onChunk, onComplete, onError) => {
    try {
        const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/evolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            let detailsMessage = '';

            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
                detailsMessage = errorData.details || '';
            } catch (e) {
                detailsMessage = `Response: "${errorText.substring(0, 100)}..."`;
            }
            throw new Error(`${errorMessage} ${detailsMessage}`.trim());
        }

        if (!response.body) {
            throw new Error("Response body is null. Streaming not supported.");
        }

        await readStream(response, onChunk, onComplete, onError);

    } catch (error) {
        console.error('Error in evolveInferenceApi:', error);
        onError(error);
    }
};


// NEW: API call to insert a new empty dialog at a specific sort order
export const insertDialogApi = async (sceneId, prevDialogId, nextDialogId) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/dialogs/insert-empty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            scene_id: sceneId,
            prev_dialog_id: prevDialogId,
            next_dialog_id: nextDialogId
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to insert empty dialog. Status: ${response.status}`);
    }
    return await response.json();
};

// NEW: API call to create a vocab entry
export const createVocabEntryApi = async (vocabData) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/vocab/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vocabData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create vocab entry. Status: ${response.status}`);
    }
    return await response.json();
};

// NEW: API call for Korean word suggestions
export const suggestKoreanWordsApi = async (sceneId, modelId) => {
    const response = await fetch(`${API_BASE_URL}/basic-inference/api/inference/suggest-korean-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            scene_id: sceneId,
            selected_model_id: modelId,
        }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch suggestions.');
    }
    return await response.json();
};