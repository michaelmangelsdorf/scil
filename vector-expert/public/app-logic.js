// vector-expert/public/app-logic.js

import {
    // Model selection elements
    modelSelectionHeader, modelCollapsibleContent, // NEW
    inferenceModelPickerGroup, inferenceModelSelect, refreshInferenceModelsBtn, // NEW ID
    inferenceModelStatus, selectedInferenceModelContextLength, inferenceModelPreferredDisplay, // NEW
    embeddingModelPickerGroup, embeddingModelSelect, refreshEmbeddingModelsBtn, // NEW ID
    embeddingModelStatus, selectedEmbeddingModelContextLength, embeddingModelPreferredDisplay, // NEW

    // Removed scene and agent selectors
    playwrightAgentSelect, contentTextbox, storeEmbeddingBtn,
    queryEmbeddingsBtn, teachDialogsBtn, playwrightQueryBtn, queryResultsTextbox,

    // Global state variables and their setters
    availableModels, setAvailableModels,
    availableAgents, setAvailableAgents, // RE-ADDED IN PREVIOUS TURN
    availablePlaywrightAgents, setAvailablePlaywrightAgents,
    selectedInferenceModelId, setSelectedInferenceModelId, // Renamed
    selectedEmbeddingModelId, setSelectedEmbeddingModelId, // NEW
    selectedSceneId, setSelectedSceneId, // Keep for Playwright context, but not from UI
    selectedAgentId, setSelectedAgentId,   // Keep for Playwright context, but not from UI
    selectedPlaywrightAgentId, setSelectedPlaywrightAgentId
} from './dom-elements.js';

import {
    fetchModelsApi, fetchScenesApi, fetchAgentsApi, // Keep fetchScenesApi and fetchAgentsApi for Playwright context
    generateAndStoreEmbeddingApi, queryEmbeddingsApi, teachDialogsApi,
    getRawEmbeddingApi,
    sendPlaywrightInferenceQueryStreaming // NEW: Import streaming function
} from './api-service.js';


// --- Helper Functions ---

// NEW: Function to update context length display for a specific model type
function updateSelectedModelContextLength(modelId, contextLengthDisplayElement) {
    const selectedModel = availableModels.find(model => model.id === modelId);
    if (selectedModel && selectedModel.context_length !== undefined) {
        contextLengthDisplayElement.textContent = `Selected Model Context Length: ${selectedModel.context_length} tokens`;
    } else {
        contextLengthDisplayElement.textContent = 'Selected Model Context Length: N/A';
    }
}

function populateDropdown(selectElement, data, valueKey, textKey, initialOptionText) {
    selectElement.innerHTML = `<option value="">${initialOptionText}</option>`;
    if (data && data.length > 0) {
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            selectElement.appendChild(option);
        });
    }
}

function clearResults() {
    queryResultsTextbox.value = '';
}

/**
 * Performs a test query to the selected LM Studio model and updates the status.
 * Checks if the model returns a non-zero embedding, indicating usability.
 * @param {string} modelId The ID of the model to test.
 * @param {HTMLElement} statusElement The DOM element to display status messages.
 * @param {HTMLElement} contextLengthDisplayElement The DOM element to display context length.
 * @returns {Promise<boolean>} True if the model is usable, false otherwise.
 */
async function performModelTestAndSetStatus(modelId, statusElement, contextLengthDisplayElement) {
    if (!modelId) {
        statusElement.textContent = 'No model selected.';
        contextLengthDisplayElement.textContent = '';
        return false;
    }

    statusElement.textContent = 'Testing model for usability...';
    contextLengthDisplayElement.textContent = ''; // Clear previous context length

    try {
        const testEmbedding = await getRawEmbeddingApi("test query for model usability", modelId);

        const isValidEmbedding = Array.isArray(testEmbedding) && testEmbedding.length > 0;
        const isZeroVector = isValidEmbedding && testEmbedding.every(val => val === 0);

        if (isValidEmbedding && !isZeroVector) {
            statusElement.textContent = 'Model loaded and ready.';
            updateSelectedModelContextLength(modelId, contextLengthDisplayElement); // Update context length
            return true;
        } else {
            let errorMessage = 'LM Studio test query returned an unusable embedding (e.g., all zeros or invalid format).';
            if (isZeroVector) {
                errorMessage = 'LM Studio returned an all-zero embedding vector. Model not usable for search.';
            } else if (!isValidEmbedding) {
                errorMessage = 'LM Studio returned an invalid embedding format.';
            }
            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('Error testing selected model:', error);
        statusElement.textContent = `Model not usable: ${error.message}`;
        contextLengthDisplayElement.textContent = '';
        alert(`Failed to test model: ${error.message}. Please ensure LM Studio is running and the model is correctly loaded for embeddings.`);
        return false;
    }
}

// Helper function to populate model dropdowns and handle preferred models
async function populateAndSelectModel(
    selectElement,
    pickerGroupElement,
    preferredDisplayElement,
    statusElement,
    contextLengthDisplayElement,
    preferredModelId,
    modelType // 'inference' or 'embedding'
) {
    selectElement.innerHTML = '<option value="">Loading Models...</option>';
    selectElement.disabled = true;
    statusElement.textContent = '';
    contextLengthDisplayElement.textContent = '';

    if (preferredModelId) {
        const preferredModel = availableModels.find(m => m.id === preferredModelId);
        if (preferredModel) {
            pickerGroupElement.classList.add('hidden');
            preferredDisplayElement.classList.remove('hidden');
            preferredDisplayElement.textContent = `Using preferred ${modelType} model: ${preferredModel.id}`;
            selectElement.innerHTML = `<option value="${preferredModel.id}">${preferredModel.id}</option>`;
            selectElement.value = preferredModel.id;
            selectElement.disabled = false;
            // Set global state
            if (modelType === 'inference') {
                setSelectedInferenceModelId(preferredModel.id);
            } else { // embedding
                setSelectedEmbeddingModelId(preferredModel.id);
            }
            await performModelTestAndSetStatus(preferredModel.id, statusElement, contextLengthDisplayElement);
            return; // Exit, as preferred model is set
        } else {
            // Preferred model from .env not found among available models
            statusElement.textContent = `Preferred ${modelType} model "${preferredModelId}" not found. Please select an available model.`;
            pickerGroupElement.classList.remove('hidden');
            preferredDisplayElement.classList.add('hidden');
        }
    } else {
        // No preferred model ID in .env
        pickerGroupElement.classList.remove('hidden');
        preferredDisplayElement.classList.add('hidden');
    }

    // If no preferred model or preferred model not found, populate dropdown
    populateDropdown(selectElement, availableModels, 'id', 'id', `Select a ${modelType} model...`);
    selectElement.disabled = false;

    // Automatically select the first model if available and no preferred was used
    if (selectElement.options.length > 1) {
        selectElement.selectedIndex = 1;
        const initialSelectedModelId = selectElement.value;
        if (modelType === 'inference') {
            setSelectedInferenceModelId(initialSelectedModelId);
        } else { // embedding
            setSelectedEmbeddingModelId(initialSelectedModelId);
        }
        await performModelTestAndSetStatus(initialSelectedModelId, statusElement, contextLengthDisplayElement);
    } else {
        statusElement.textContent = `No ${modelType} models found. Is LM Studio running?`;
        selectElement.disabled = true;
    }
}


// --- Initialization Functions ---

async function initializeModels() {
    try {
        const modelsData = await fetchModelsApi(); // This now returns { data: models, preferredInferenceModelId, preferredEmbeddingModelId }
        setAvailableModels(modelsData.data); // Store all available models

        // Initialize Inference Model Selector
        await populateAndSelectModel(
            inferenceModelSelect,
            inferenceModelPickerGroup,
            inferenceModelPreferredDisplay,
            inferenceModelStatus,
            selectedInferenceModelContextLength,
            modelsData.preferredInferenceModelId,
            'inference'
        );

        // Initialize Embedding Model Selector
        await populateAndSelectModel(
            embeddingModelSelect,
            embeddingModelPickerGroup,
            embeddingModelPreferredDisplay,
            embeddingModelStatus,
            selectedEmbeddingModelContextLength,
            modelsData.preferredEmbeddingModelId,
            'embedding'
        );

    } catch (error) {
        console.error('Error fetching models:', error);
        inferenceModelSelect.innerHTML = '<option value="">Error loading models</option>';
        inferenceModelSelect.disabled = true;
        inferenceModelStatus.textContent = `Error: ${error.message}. Is LM Studio running on http://localhost:1234?`;

        embeddingModelSelect.innerHTML = '<option value="">Error loading models</option>';
        embeddingModelSelect.disabled = true;
        embeddingModelStatus.textContent = `Error: ${error.message}. Is LM Studio running on http://localhost:1234?`;
    } finally {
        // Ensure collapsibles are initialized after models are loaded
        initializeCollapsibles();
    }
}

// Removed initializeScenes as scene selector is removed from UI
// async function initializeScenes() {
//     sceneSelect.innerHTML = '<option value="">Loading Scenes...</option>';
//     try {
//         const scenes = await fetchScenesApi(); // Call the API service
//         setAvailableScenes(scenes); // Update global state
//         populateDropdown(sceneSelect, scenes, 'scene_id', 'name', 'Select a scene (optional)');
//     } catch (error) {
//         console.error('Error fetching scenes:', error);
//         sceneSelect.innerHTML = '<option value="">Error loading scenes</option>';
//     }
// }

async function initializeAgents() {
    // Removed agentSelect initialization as agent selector is removed from UI
    playwrightAgentSelect.innerHTML = '<option value="">Loading Playwright Agents...</option>';
    try {
        const agents = await fetchAgentsApi(); // Call the API service
        setAvailableAgents(agents); // Update global state with all agents
        console.log('Fetched agents from API:', agents); // Log all fetched agents

        // Filter for Playwright agents (case-insensitive)
        const playwrightAgents = agents.filter(agent => agent.type && agent.type.toLowerCase().includes('playwright'));
        setAvailablePlaywrightAgents(playwrightAgents);
        console.log('Filtered Playwright agents:', playwrightAgents); // Log filtered agents

        // Removed populateDropdown for agentSelect
        populateDropdown(playwrightAgentSelect, playwrightAgents, 'id', 'name', 'Select a Playwright agent');
    } catch (error) {
        console.error('Error fetching agents:', error);
        // Removed agentSelect error message
        playwrightAgentSelect.innerHTML = '<option value="">Error loading Playwright agents</option>';
    }
}


// --- Event Handlers ---

document.addEventListener('DOMContentLoaded', () => {
    initializeModels(); // Now handles both inference and embedding models
    // Removed initializeScenes() call
    initializeAgents();
});

// NEW: Event listeners for refresh buttons
refreshInferenceModelsBtn.addEventListener('click', initializeModels);
refreshEmbeddingModelsBtn.addEventListener('click', initializeModels);


// NEW: Event listeners for model select changes
inferenceModelSelect.addEventListener('change', async (event) => {
    const selectedId = event.target.value;
    setSelectedInferenceModelId(selectedId);
    await performModelTestAndSetStatus(selectedId, inferenceModelStatus, selectedInferenceModelContextLength);
});

embeddingModelSelect.addEventListener('change', async (event) => {
    const selectedId = event.target.value;
    setSelectedEmbeddingModelId(selectedId);
    await performModelTestAndSetStatus(selectedId, embeddingModelStatus, selectedEmbeddingModelContextLength);
});


// Removed sceneSelect event listener
// sceneSelect.addEventListener('change', () => {
//     const selectedId = sceneSelect.value;
//     setSelectedSceneId(selectedId ? parseInt(selectedId) : null); // Convert to number or null
// });

// Removed agentSelect event listener
// agentSelect.addEventListener('change', () => {
//     const selectedId = agentSelect.value;
//     setSelectedAgentId(selectedId ? parseInt(selectedId) : null); // Convert to number or null
// });

playwrightAgentSelect.addEventListener('change', () => {
    const selectedId = playwrightAgentSelect.value;
    setSelectedPlaywrightAgentId(selectedId ? parseInt(selectedId) : null); // Convert to number or null
});


storeEmbeddingBtn.addEventListener('click', async () => {
    const content = contentTextbox.value.trim();
    if (!content) {
        alert('Please enter content to store.');
        return;
    }
    // Use selectedEmbeddingModelId for storing embeddings
    if (!selectedEmbeddingModelId) {
        alert('Please select an embedding model.');
        return;
    }

    storeEmbeddingBtn.disabled = true;
    queryResultsTextbox.value = 'Storing embedding in memory...';

    try {
        // This now inserts into memory_embeddings. scene_id and agent_id will be null.
        const result = await generateAndStoreEmbeddingApi(content, null, null, selectedEmbeddingModelId); // Pass null for scene_id, agent_id
        queryResultsTextbox.value = `Success: ${result.message}\nID: ${result.id}\nEmbedding Length: ${result.embedding_length}`;
        alert('Embedding stored successfully in memory!');
    } catch (error) {
        console.error('Error storing embedding in memory:', error);
        queryResultsTextbox.value = `Error: ${error.message}`;
        alert(`Error storing embedding in memory: ${error.message}`);
    } finally {
        storeEmbeddingBtn.disabled = false;
    }
});

queryEmbeddingsBtn.addEventListener('click', async () => {
    const queryText = contentTextbox.value.trim();
    if (!queryText) {
        alert('Please enter a query for vector search.');
        return;
    }
    // Use selectedEmbeddingModelId for querying embeddings
    if (!selectedEmbeddingModelId) {
        alert('Please select an embedding model.');
        return;
    }

    queryEmbeddingsBtn.disabled = true;
    queryResultsTextbox.value = 'Running vector search across both knowledge bases...';

    try {
        const results = await queryEmbeddingsApi(queryText, selectedEmbeddingModelId); // Use selectedEmbeddingModelId

        let output = '';

        // Display Memory Embeddings results
        if (results.memory_results && results.memory_results.length > 0) {
            output += '--- In Memories: ---\n';
            results.memory_results.forEach((item, index) => {
                // Safely access distance, provide N/A if null/undefined
                const distanceDisplay = typeof item.distance === 'number' ? item.distance.toFixed(4) : 'N/A';
                output += `Result ${index + 1} (Distance: ${distanceDisplay}) [ID: ${item.id}]\n`;
                output += `   Scene: ${item.scene_name || 'N/A'} (ID: ${item.scene_id || 'N/A'})\n`;
                output += `   Agent: ${item.agent_name || 'N/A'} (ID: ${item.agent_id || 'N/A'})\n`;
                output += `   Content: ${item.content}\n\n`;
            });
        } else {
            output += '--- In Memories: No relevant results found.\n\n';
        }

        // Display Vector Embeddings results
        if (results.vector_results && results.vector_results.length > 0) {
            output += '--- In Vector: ---\n';
            results.vector_results.forEach((item, index) => {
                // Safely access distance, provide N/A if null/undefined
                const distanceDisplay = typeof item.distance === 'number' ? item.distance.toFixed(4) : 'N/A';
                output += `Result ${index + 1} (Distance: ${distanceDisplay}) [ID: ${item.id}]\n`;
                output += `   Scene: ${item.scene_name || 'N/A'} (ID: ${item.scene_id || 'N/A'})\n`;
                output += `   Source Type: ${item.source_type || 'N/A'} (Source ID: ${item.source_id || 'N/A'})\n`;
                output += `   Content: ${item.content}\n\n`;
            });
        } else {
            output += '--- In Vector: No relevant results found.\n\n';
        }

        queryResultsTextbox.value = output;

    } catch (error) {
        console.error('Error querying embeddings:', error);
        queryResultsTextbox.value = `Error: ${error.message}`;
        alert(`Error querying embeddings: ${error.message}`);
    } finally {
        queryEmbeddingsBtn.disabled = false;
    }
});

// Teach All Dialogs button event listener (only affects vector_embeddings)
teachDialogsBtn.addEventListener('click', async () => {
    // Use selectedEmbeddingModelId for teaching dialogs
    if (!selectedEmbeddingModelId) {
        alert('Please select an embedding model to teach dialogs.');
        return;
    }

    teachDialogsBtn.disabled = true;
    queryResultsTextbox.value = 'Teaching all dialogs into `vector_embeddings` (clearing previous entries)... This may take a while for many dialogs.';

    try {
        const result = await teachDialogsApi(selectedEmbeddingModelId); // Use selectedEmbeddingModelId
        queryResultsTextbox.value = `Success: ${result.message}\nTotal Dialogs Processed: ${result.totalDialogsProcessed}\nTotal Embeddings Stored: ${result.totalEmbeddingsStored}`;
        alert('All dialogs taught successfully into `vector_embeddings`!');
    } catch (error) {
        console.error('Error teaching dialogs:', error);
        queryResultsTextbox.value = `Error teaching dialogs: ${error.message}`;
        alert(`Error teaching dialogs: ${error.message}`);
    } finally {
        teachDialogsBtn.disabled = false;
    }
});

// NEW: Playwright Query button event listener
playwrightQueryBtn.addEventListener('click', async () => {
    const userQuery = contentTextbox.value.trim();
    if (!userQuery) {
        alert('Please enter a user query for Playwright inference.');
        return;
    }
    // Use selectedInferenceModelId for Playwright inference
    if (!selectedInferenceModelId) {
        alert('Please select an LM Studio model for inference.');
        return;
    }
    if (!selectedPlaywrightAgentId) {
        alert('Please select a Playwright agent.');
        return;
    }

    playwrightQueryBtn.disabled = true;
    queryResultsTextbox.value = 'Sending Playwright inference query...';

    // Set up streaming callbacks
    let accumulatedResponse = '';
    const onChunk = (chunk) => {
        accumulatedResponse += chunk;
        queryResultsTextbox.value = accumulatedResponse;
        queryResultsTextbox.scrollTop = queryResultsTextbox.scrollHeight; // Auto-scroll
    };
    const onComplete = () => {
        console.log('Playwright inference stream complete.');
        playwrightQueryBtn.disabled = false;
        // No popup needed here
        // The problematic alert has been removed from here.
    };
    const onError = (error) => {
        console.error('Error performing Playwright inference:', error);
        queryResultsTextbox.value = `Error performing Playwright inference: ${error.message}`;
        alert(`Error performing Playwright inference: ${error.message}`); // This alert remains for actual errors
        playwrightQueryBtn.disabled = false;
    };

    try {
        // We will fetch story_name and story_outline in the backend (vector-expert/app.js)
        // No need to fetch allScenes and allAgents here anymore, as the backend will get necessary context

        await sendPlaywrightInferenceQueryStreaming(
            selectedPlaywrightAgentId,
            selectedInferenceModelId,
            userQuery,
            onChunk,
            onComplete,
            onError,
            null, // scene_id is now always null from UI perspective
            null    // agent_id is now always null from UI perspective
        );

    } catch (error) {
        // This catch block handles errors that occur *before* the stream starts (e.g., network error initiating stream)
        console.error('Error initiating Playwright inference stream:', error);
        queryResultsTextbox.value = `Error initiating Playwright inference: ${error.message}`;
        alert(`Error initiating Playwright inference: ${error.message}`);
        playwrightQueryBtn.disabled = false;
    }
});


// NEW: Collapsible Sections Logic (copied from basic-inference)
const initializeCollapsibles = () => {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        const content = header.nextElementSibling;
        // Set initial state to collapsed for all collapsible content
        content.style.maxHeight = '0';
        content.style.paddingTop = '0';
        content.style.paddingBottom = '0';
        content.classList.remove('active'); // Ensure content does not have 'active' class initially
        header.classList.remove('active'); // Ensure header does not have 'active' class initially
    });
};

document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', function() {
        const content = this.nextElementSibling;
        if (content.classList.contains('active')) {
            // If it was active, now collapsing
            content.style.maxHeight = '0';
            content.style.paddingTop = '0';
            content.style.paddingBottom = '0';
            content.classList.remove('active');
            this.classList.remove('active'); // Remove active from header
        } else {
            // If it was collapsed, now expanding
            // Temporarily set maxHeight to 'none' to get the full scrollHeight
            content.style.maxHeight = 'none';
            const scrollHeight = content.scrollHeight; // Get the natural height
            content.style.maxHeight = '0'; // Reset to 0 for transition start
            content.offsetHeight; // Trigger reflow to apply the 0px height immediately
            content.style.maxHeight = scrollHeight + 'px'; // Animate to full height
            content.style.paddingTop = '15px';
            content.style.paddingBottom = '15px';
            content.classList.add('active');
            this.classList.add('active'); // Add active to header

            // After transition, set maxHeight to 'none' to allow content to grow/shrink naturally
            // if window resizes or content changes
            content.addEventListener('transitionend', function handler() {
                if (content.classList.contains('active')) {
                    content.style.maxHeight = 'none';
                }
                content.removeEventListener('transitionend', handler);
            });
        }
    });
});