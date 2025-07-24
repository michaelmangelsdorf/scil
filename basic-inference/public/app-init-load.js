// basic-inference/public/app-init-load.js
import {
    AppState,
    inferenceModelPickerGroup,
    inferenceModelSelect,
    inferenceModelPreferredDisplay,
    inferenceModelStatus,
    selectedInferenceModelContextLength,
    embeddingModelPickerGroup,
    embeddingModelSelect,
    embeddingModelPreferredDisplay,
    embeddingModelStatus,
    selectedEmbeddingModelContextLength,
    sceneListbox,
    aiPersonaField,
    userAgentField,
    sceneCanonSynopsisDisplay,
    userQueryTextbox,
    aiResponseTextbox,
    commentTextbox,
    revisedTextarea,
    exemplaryCheckbox,
    dialogPrevBtn,
    dialogNextBtn,
    dialogSortOrderDisplay,
    selectedSceneNameDisplay,
} from './dom-elements.js';

import {
    fetchModelsApi,
    fetchScenesApi,
    fetchSceneDialogsApi,
    fetchAgentsApi
} from './api-service.js';

// Helper to truncate text for display
const getTruncatedText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
};


export const displayAgentDetails = (agentName) => {
    return agentName;
};

export const displayUserAgentDetails = (agentName) => {
    return agentName;
};

export const displaySceneDetails = async (sceneId) => {
    try {
        const response = await fetch(`/basic-inference/api/scene-details/${sceneId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const sceneDetails = await response.json();
        if (sceneCanonSynopsisDisplay) {
            sceneCanonSynopsisDisplay.innerHTML = `
                <h3>Scene Details: "${sceneDetails.name}"</h3>
                <p><strong>Canon:</strong> ${sceneDetails.canon || 'N/A'}</p>
                <p><strong>Synopsis:</strong> ${sceneDetails.synopsis || 'N/A'}</p>
            `;
        }
    } catch (error) {
        console.error(`Failed to load scene details for ${sceneId}:`, error);
        if (sceneCanonSynopsisDisplay) {
            sceneCanonSynopsisDisplay.innerHTML = `<p class="error-message">Error loading scene details: ${error.message}</p>`;
        }
    }
};

export const clearDialogInteractionDisplay = () => {
    userQueryTextbox.value = '';
    aiResponseTextbox.value = '';
    commentTextbox.value = '';
    revisedTextarea.value = '';
    exemplaryCheckbox.checked = false;
    aiPersonaField.value = '';
    userAgentField.value = '';
    userQueryTextbox.placeholder = 'Enter your query here...';
    aiResponseTextbox.placeholder = 'Agent response will appear here...';
    dialogPrevBtn.disabled = true;
    dialogNextBtn.disabled = true;
    dialogSortOrderDisplay.textContent = '';
};

export const displayCurrentDialog = async () => {
    const dialogs = AppState.currentSceneDialogs;
    const index = AppState.currentDialogIndex;

    if (dialogs.length === 0 || index < 0 || index >= dialogs.length) {
        clearDialogInteractionDisplay();
        return;
    }

    const dialog = dialogs[index];

    userQueryTextbox.value = dialog.user_query || '';
    aiResponseTextbox.value = dialog.ai_response || '';
    commentTextbox.value = dialog.comment || '';
    revisedTextarea.value = dialog.revised || '';
    exemplaryCheckbox.checked = !!dialog.exemplary;
    dialogSortOrderDisplay.textContent = `${index + 1}/${dialogs.length}`;

    // 1. Set personas from the current dialog's data first.
    aiPersonaField.value = dialog.ai_persona || '';
    userAgentField.value = dialog.user_persona || '';

    // 2. If a dropdown is still empty (e.g., for a new dialog),
    //    try to populate it from the previous dialog in the scene.
    if (aiPersonaField.value === '' && index > 0) {
        aiPersonaField.value = dialogs[index - 1].ai_persona || '';
    }
    if (userAgentField.value === '' && index > 0) {
        userAgentField.value = dialogs[index - 1].user_persona || '';
    }

    // 3. Sync the global state with the final state of the UI dropdowns.
    AppState.selectedAiPersonaName = aiPersonaField.value || null;
    AppState.selectedUserAgentName = userAgentField.value || null;

    updateDialogNavigationButtons();
};

export const updateDialogNavigationButtons = () => {
    dialogPrevBtn.disabled = AppState.currentDialogIndex <= 0;
    dialogNextBtn.disabled = AppState.currentDialogIndex >= AppState.currentSceneDialogs.length - 1;
};


export const loadAndDisplaySceneDialogs = async (sceneId) => {
    if (!sceneId) {
        AppState.currentSceneDialogs = [];
        AppState.currentDialogIndex = -1;
        clearDialogInteractionDisplay();
        return;
    }
    try {
        const dialogs = await fetchSceneDialogsApi(sceneId); 
        AppState.currentSceneDialogs = dialogs;

        if (dialogs.length > 0) {
            AppState.currentDialogIndex = dialogs.length - 1; 
        } else {
            AppState.currentDialogIndex = -1;
        }
        
        await displayCurrentDialog();
    } catch (error) {
        console.error(`Failed to load dialogs for scene ${sceneId}:`, error);
        userQueryTextbox.value = `Error loading dialogs: ${error.message}`;
        AppState.currentSceneDialogs = [];
        AppState.currentDialogIndex = -1;
        clearDialogInteractionDisplay();
    }
};

export const loadScene = async (sceneId) => {
    if (sceneId) {
        AppState.selectedSceneId = sceneId;
        console.log(`Scene ${sceneId} selected/loaded.`);
        await displaySceneDetails(sceneId);
        await loadAndDisplaySceneDialogs(sceneId);

        try {
            const response = await fetch(`/basic-inference/api/scene-details/${sceneId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const sceneDetails = await response.json();
            if (selectedSceneNameDisplay) {
                selectedSceneNameDisplay.textContent = `(${sceneDetails.name})`;
            }
        } catch (error) {
            console.error(`Failed to load scene name for header:`, error);
            if (selectedSceneNameDisplay) {
                selectedSceneNameDisplay.textContent = '(Error loading name)';
            }
        }

    } else {
        AppState.selectedSceneId = null;
        console.log('No scene selected or scene cleared.');
        if (sceneCanonSynopsisDisplay) {
            sceneCanonSynopsisDisplay.innerHTML = '<p>No scenes are marked for inclusion.</p>';
        }
        clearDialogInteractionDisplay();
        if (selectedSceneNameDisplay) {
            selectedSceneNameDisplay.textContent = '';
        }
    }
};

export const loadInitialData = async () => {
    const modelSelectionSection = document.getElementById('model-selection-section');

    try {
        const modelsApiResponse = await fetchModelsApi();

        if (modelsApiResponse.localModelError) {
            alert("Model files not found - please check .env file or select LM Studio option in settings");
            window.location.href = '/settings';
            return;
        }
        
        AppState.isLmStudio = modelsApiResponse.isLmStudio;

        if (modelsApiResponse.isLmStudio === false) {
            if(modelSelectionSection) modelSelectionSection.style.display = 'none';
        }

        const { data: models, preferredInferenceModelId, preferredEmbeddingModelId } = modelsApiResponse;
        
        const res = await fetch('/basic-inference/api/state/pacing/pacingState');
        if (res.ok) {
            const stateData = await res.json();
            AppState.pacingState = JSON.parse(stateData.value);
            console.log('Loaded persisted pacingState:', AppState.pacingState);
        } else {
            console.log('No persisted pacingState found. Using defaults.');
        }

        if (preferredInferenceModelId) {
            const preferredModel = models.find(m => m.id === preferredInferenceModelId);
            if (preferredModel) {
                inferenceModelPickerGroup.classList.add('hidden');
                inferenceModelPreferredDisplay.classList.remove('hidden');
                inferenceModelPreferredDisplay.textContent = `Using preferred inference model: ${preferredModel.id}`;
                AppState.selectedInferenceModelId = preferredModel.id;
                AppState.selectedInferenceModelContextLength = preferredModel.context_length;
            } else {
                inferenceModelPickerGroup.classList.remove('hidden');
                inferenceModelPreferredDisplay.classList.add('hidden');
                inferenceModelStatus.textContent = `Preferred inference model "${preferredInferenceModelId}" not found. Please select an available model.`;
                populateModelSelect(inferenceModelSelect, models, inferenceModelStatus, selectedInferenceModelContextLength, 'inference');
            }
        } else {
            inferenceModelPickerGroup.classList.remove('hidden');
            inferenceModelPreferredDisplay.classList.add('hidden');
            populateModelSelect(inferenceModelSelect, models, inferenceModelStatus, selectedInferenceModelContextLength, 'inference');
        }

        if (preferredEmbeddingModelId) {
            const preferredModel = models.find(m => m.id === preferredEmbeddingModelId);
            if (preferredModel) {
                embeddingModelPickerGroup.classList.add('hidden');
                embeddingModelPreferredDisplay.classList.remove('hidden');
                embeddingModelPreferredDisplay.textContent = `Using preferred embedding model: ${preferredModel.id}`;
                AppState.selectedEmbeddingModelId = preferredModel.id;
                AppState.selectedEmbeddingModelContextLength = preferredModel.context_length;
            } else {
                embeddingModelPickerGroup.classList.remove('hidden');
                embeddingModelPreferredDisplay.classList.add('hidden');
                embeddingModelStatus.textContent = `Preferred embedding model "${preferredEmbeddingModelId}" not found. Please select an available model.`;
                populateModelSelect(embeddingModelSelect, models, embeddingModelStatus, selectedEmbeddingModelContextLength, 'embedding');
            }
        } else {
            embeddingModelPickerGroup.classList.remove('hidden');
            embeddingModelPreferredDisplay.classList.add('hidden');
            populateModelSelect(embeddingModelSelect, models, embeddingModelStatus, selectedEmbeddingModelContextLength, 'embedding');
        }

    } catch (error) {
        console.error('Failed to load initial data:', error);
        alert(`Failed to load initial data: ${error.message}`);
        window.location.href = '/settings';
        return;
    }
    
    try {
        const agents = await fetchAgentsApi();
        const personAgents = agents.filter(agent => agent.type === 'Person');
        AppState.availablePersonAgents = personAgents;

        userAgentField.innerHTML = '<option value="">Select Actor...</option>';
        personAgents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent.name;
            option.textContent = `${agent.name}`;
            userAgentField.appendChild(option);
        });
        userAgentField.disabled = false;

        aiPersonaField.innerHTML = '<option value="">Select Responder...</option>';
        personAgents.forEach(agent => {
            const option = document.createElement('option');
            option.value = agent.name;
            option.textContent = `${agent.name}`;
            aiPersonaField.appendChild(option);
        });
        aiPersonaField.disabled = false;

        if (personAgents.length > 0) {
            userAgentField.value = personAgents[0].name;
            AppState.selectedUserAgentName = personAgents[0].name;
            aiPersonaField.value = personAgents[0].name;
            AppState.selectedAiPersonaName = personAgents[0].name;
        }

    } catch (error) {
        console.error('Failed to load agents:', error);
        userAgentField.innerHTML = '<option value="">Error loading actors</option>';
        userAgentField.disabled = true;
        aiPersonaField.innerHTML = '<option value="">Error loading responders</option>';
        aiPersonaField.disabled = true;
    }

    try {
        const allScenes = await fetchScenesApi();
        const includedScenes = allScenes.filter(scene => scene.include === 1);
        sceneListbox.innerHTML = '';
        includedScenes.forEach(scene => {
            const option = document.createElement('option');
            option.value = scene.scene_id;
            option.textContent = scene.name;
            sceneListbox.appendChild(option);
        });
        sceneListbox.disabled = false;
        if (includedScenes.length > 0) {
            const lastScene = includedScenes[includedScenes.length - 1];
            sceneListbox.value = lastScene.scene_id;
            await loadScene(lastScene.scene_id);
        } else {
            sceneListbox.innerHTML = '<option value="">No Scenes Available</option>';
            AppState.selectedSceneId = null;
            if (sceneCanonSynopsisDisplay) {
                sceneCanonSynopsisDisplay.innerHTML = '<p>No scenes are marked for inclusion.</p>';
            }
            clearDialogInteractionDisplay();
        }
    } catch (error) {
        sceneListbox.innerHTML = '<option value="">Error loading scenes</option>';
        sceneListbox.disabled = true;
        console.error('Failed to load scenes:', error);
    }
};

function populateModelSelect(selectElement, models, statusElement, contextLengthElement, modelType) {
    selectElement.innerHTML = '<option value="">Select a Model</option>';
    if (models.length > 0) {
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            option.dataset.contextLength = model.context_length;
            selectElement.appendChild(option);
        });
        selectElement.disabled = false;
        selectElement.value = models[0].id;
        if (modelType === 'inference') {
            AppState.selectedInferenceModelId = models[0].id;
            AppState.selectedInferenceModelContextLength = models[0].context_length;
        } else if (modelType === 'embedding') {
            AppState.selectedEmbeddingModelId = models[0].id;
            AppState.selectedEmbeddingModelContextLength = models[0].context_length;
        }
        statusElement.textContent = `Selected: ${models[0].id}`;
        contextLengthElement.textContent = `Context Length: ${models[0].context_length} tokens`;
    } else {
        statusElement.textContent = 'No models available.';
        contextLengthElement.textContent = '';
        selectElement.disabled = true;
    }
}