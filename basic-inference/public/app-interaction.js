// to_gemini/basic-inference/public/app-interaction.js
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
    refreshInferenceModelsBtn, // Renamed import
    refreshEmbeddingModelsBtn, // NEW import
    sceneListbox,
    aiPersonaField,
    userAgentField,
    userQueryTextbox,
    aiResponseTextbox,
    responseSpinner,
    commentTextbox,
    revisedTextarea,
    exemplaryCheckbox,
    playBtn,
    refineCheckbox,
    thinkBtn,
    planBtn,
    wonderBtn,
    evolveBtn,
    saveDialogBtn,
    insertDialogBtn,
    clearTextFieldsBtn,
    vocabBtn,
    keyboardBtn, // NEW
    dialogPrevBtn,
    dialogNextBtn,
    reloadCurrentDialogBtn,
    autoBtn,
    deleteDialogBtn,
} from './dom-elements.js';

import {
    saveDialogApi,
    playInferenceApiNonStreaming,
    playInferenceApiStreaming,
    checkerInferenceApi,
    thinkInferenceApi,
    planInferenceApi,
    wonderInferenceApi,
    evolveInferenceApi,
    autoInferenceApiStreaming,
    insertDialogApi,
    createVocabEntryApi,
    deleteDialogApi,
} from './api-service.js';

import {
    loadInitialData,
    loadScene,
    displayCurrentDialog,
    updateDialogNavigationButtons,
    clearDialogInteractionDisplay,
    loadAndDisplaySceneDialogs
} from './app-init-load.js';

import { onPlayStart, onPlayEnd } from './convint.js';

// Import Keyboard functions
import { initKoreanKeyboard, openKoreanKeyboard } from './korean-keyboard.js';


// --- Helper Functions for a Better UX ---

const setAllButtonsDisabled = (disabled) => {
    playBtn.disabled = disabled;
    autoBtn.disabled = disabled;
    thinkBtn.disabled = disabled;
    planBtn.disabled = disabled;
    wonderBtn.disabled = disabled;
    evolveBtn.disabled = disabled;
    saveDialogBtn.disabled = disabled;
    insertDialogBtn.disabled = disabled;
    clearTextFieldsBtn.disabled = disabled;
    vocabBtn.disabled = disabled;
    keyboardBtn.disabled = disabled; // NEW: Disable the new keyboard button
    dialogPrevBtn.disabled = disabled;
    dialogNextBtn.disabled = disabled;
    reloadCurrentDialogBtn.disabled = disabled;
    refreshInferenceModelsBtn.disabled = disabled; // Use renamed variable
    refreshEmbeddingModelsBtn.disabled = disabled; // NEW
    deleteDialogBtn.disabled = disabled;
};

const showStatus = (message, targetTextbox = aiResponseTextbox) => {
    commentTextbox.value = '';
    targetTextbox.value = message;
    targetTextbox.classList.add('status-text');
    responseSpinner.style.display = 'inline-block';
    return new Promise(resolve => setTimeout(resolve, 50));
};

const clearStatusForResponse = (targetTextbox = aiResponseTextbox) => {
    targetTextbox.value = '';
    targetTextbox.placeholder = targetTextbox === userQueryTextbox ? 'Enter your query here...' : 'Agent response will appear here...';
    targetTextbox.classList.remove('status-text');
};

const hideStatusAndEnableButtons = () => {
    responseSpinner.style.display = 'none';
    setAllButtonsDisabled(false);
    updateDialogNavigationButtons();
};

const showNotification = (message) => {
    // IMPORTANT: Do NOT use alert() or confirm() in production code.
    // This is a placeholder for a custom modal or toast notification.
    alert(message); 
};

const validateCommonFields = () => {
    if (!AppState.selectedSceneId) {
        showNotification('Please select a scene.');
        return false;
    }
    // Only check for a selected model if we are in LM Studio mode
    if (AppState.isLmStudio && !AppState.selectedInferenceModelId) {
        showNotification('Please select an LM Studio Inference model.');
        return false;
    }
    if (!aiPersonaField.value || !userAgentField.value) {
        showNotification('Agent and User fields cannot be empty. Please select from the dropdowns.');
        return false;
    }
    return true;
};

// --- Event Listeners ---

inferenceModelSelect.addEventListener('change', (event) => {
    AppState.selectedInferenceModelId = event.target.value;
    const selectedOption = event.target.options[event.target.selectedIndex];
    const contextLength = selectedOption ? selectedOption.dataset.contextLength : 'N/A';
    AppState.selectedInferenceModelContextLength = contextLength;
    if (event.target.value) {
        inferenceModelStatus.textContent = `Selected: ${event.target.value}`;
        selectedInferenceModelContextLength.textContent = `Context Length: ${contextLength} tokens`;
    } else {
        inferenceModelStatus.textContent = 'No inference model selected.';
        selectedInferenceModelContextLength.textContent = '';
    }
});

embeddingModelSelect.addEventListener('change', (event) => {
    AppState.selectedEmbeddingModelId = event.target.value;
    const selectedOption = event.target.options[event.target.selectedIndex];
    const contextLength = selectedOption ? selectedOption.dataset.contextLength : 'N/A';
    AppState.selectedEmbeddingModelContextLength = contextLength;
    if (event.target.value) {
        embeddingModelStatus.textContent = `Selected: ${event.target.value}`;
        selectedEmbeddingModelContextLength.textContent = `Context Length: ${contextLength} tokens`;
    } else {
        embeddingModelStatus.textContent = 'No embedding model selected.';
        selectedEmbeddingModelContextLength.textContent = '';
    }
});

userAgentField.addEventListener('change', (event) => {
    AppState.selectedUserAgentName = event.target.value;
    // Removed lines that clear text areas
});

aiPersonaField.addEventListener('change', (event) => {
    AppState.selectedAiPersonaName = event.target.value;
    // Removed lines that clear text areas
});


sceneListbox.addEventListener('change', async (event) => {
    await loadScene(event.target.value);
});

refreshInferenceModelsBtn.addEventListener('click', async () => { // Renamed listener
    inferenceModelSelect.innerHTML = '<option value="">Loading Models...</option>';
    inferenceModelSelect.disabled = true;
    inferenceModelStatus.textContent = 'Refreshing models...';
    selectedInferenceModelContextLength.textContent = '';

    // No need to clear embedding models here, as loadInitialData will handle both
    // embeddingModelSelect.innerHTML = '<option value="">Loading Models...</option>';
    // embeddingModelSelect.disabled = true;
    // embeddingModelStatus.textContent = 'Refreshing models...';
    // selectedEmbeddingModelContextLength.textContent = '';

    try {
        await loadInitialData();
        showNotification('Models and scenes refreshed successfully.');
    } catch (error) {
        showNotification(`Failed to refresh models: ${error.message || error}`);
    }
});

// NEW: Event listener for embedding models refresh button
refreshEmbeddingModelsBtn.addEventListener('click', async () => {
    embeddingModelSelect.innerHTML = '<option value="">Loading Models...</option>';
    embeddingModelSelect.disabled = true;
    embeddingModelStatus.textContent = 'Refreshing models...';
    selectedEmbeddingModelContextLength.textContent = '';

    try {
        await loadInitialData(); // loadInitialData refreshes all aspects
        showNotification('Models and scenes refreshed successfully.');
    } catch (error) {
        showNotification(`Failed to refresh embedding models: ${error.message || error}`);
    }
});

playBtn.addEventListener('click', async () => {
    if (!validateCommonFields() || !userQueryTextbox.value.trim()) {
        if (!userQueryTextbox.value.trim()) showNotification('Please enter a User Query for Play inference.');
        return;
    }

    setAllButtonsDisabled(true);

    let payload = {
        scene_id: AppState.selectedSceneId,
        user_query: userQueryTextbox.value.trim(),
        ai_persona_name: AppState.selectedAiPersonaName,
        user_persona_name: AppState.selectedUserAgentName,
        selected_model_id: AppState.selectedInferenceModelId,
    };

    payload = await onPlayStart('pacing', payload, AppState.pacingState);

    const handleCompletion = async (finalResponse, requestPayload) => {
        hideStatusAndEnableButtons();
        
        const newPacingState = await onPlayEnd('pacing', finalResponse, requestPayload);
        
        if (newPacingState) {
            AppState.pacingState = newPacingState;
            console.log('Updated local pacingState:', AppState.pacingState);

            try {
                await fetch('/basic-inference/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: 'pacing',
                        key: 'pacingState',
                        value: JSON.stringify(newPacingState)
                    })
                });
                console.log('Persisted pacingState to database.');
            } catch (error) {
                console.error('Failed to persist pacingState:', error);
            }
        }
    };

    if (refineCheckbox.checked) {
        await showStatus('➡️ Step 1/2: Generating initial roleplay response...');
        let initialAgentResponse = '';
        let isFirstChunkStep1 = true;
        await playInferenceApiStreaming(payload,
            (chunk) => { // onChunk for step 1
                if (isFirstChunkStep1) { clearStatusForResponse(); isFirstChunkStep1 = false; }
                initialAgentResponse += chunk;
                aiResponseTextbox.value = initialAgentResponse;
                aiResponseTextbox.scrollTop = aiResponseTextbox.scrollHeight;
            },
            async () => { // onComplete for step 1
                await showStatus('➡️ Step 2/2: Refining response for clarity and style...');
                const checkerPayload = {
                    agent_name: AppState.selectedAiPersonaName,
                    agent_response_text: initialAgentResponse,
                    selected_model_id: AppState.selectedInferenceModelId,
                    pacingKey: payload.pacingKey
                };
                let finalAgentResponse = '';
                let isFirstChunkStep2 = true;
                await checkerInferenceApi(checkerPayload,
                    (chunk) => { // onChunk for step 2
                        if (isFirstChunkStep2) {
                            finalAgentResponse = ''; // Clear the initial response
                            isFirstChunkStep2 = false;
                        }
                        finalAgentResponse += chunk;
                        aiResponseTextbox.value = finalAgentResponse;
                        aiResponseTextbox.scrollTop = aiResponseTextbox.scrollHeight;
                    },
                    () => { // onComplete for step 2
                        console.log('Play & Refine Inference Complete.');
                        handleCompletion(finalAgentResponse, payload);
                    },
                    (error) => { showNotification(`Refine Failed: ${error.message}`); clearStatusForResponse(); hideStatusAndEnableButtons(); }
                );
            },
            (error) => { showNotification(`Play Inference Failed: ${error.message}`); clearStatusForResponse(); hideStatusAndEnableButtons(); }
        );
    } else {
        await showStatus('▶️ Playing response directly...');
        let finalAgentResponse = '';
        let isFirstChunk = true;
        await playInferenceApiStreaming(payload,
            (chunk) => {
                if (isFirstChunk) { clearStatusForResponse(); isFirstChunk = false; }
                finalAgentResponse += chunk;
                aiResponseTextbox.value = finalAgentResponse;
                aiResponseTextbox.scrollTop = aiResponseTextbox.scrollHeight;
            },
            () => {
                console.log('Direct Play Inference Complete.');
                handleCompletion(finalAgentResponse, payload);
            },
            (error) => { showNotification(`Direct Play Failed: ${error.message}`); clearStatusForResponse(); hideStatusAndEnableButtons(); }
        );
    }
});

const runNonStreamingInference = async (buttonType, apiFunc) => {
    if (!validateCommonFields()) return;
    setAllButtonsDisabled(true);
    const messages = { think: '🤔 Person is thinking...', plan: '📝 Person is planning...' }; 
    await showStatus(messages[buttonType]);
    const payload = { scene_id: AppState.selectedSceneId, agent_name: AppState.selectedAiPersonaName, selected_model_id: AppState.selectedInferenceModelId };
    try {
        const response = await apiFunc(payload);
        clearStatusForResponse();
        aiResponseTextbox.value = response.new_state || response.new_goals || 'Person process completed.';
    } catch (error) { showNotification(`${buttonType.charAt(0).toUpperCase() + buttonType.slice(1)} Inference Failed: ${error.message}`); clearStatusForResponse(); } finally { hideStatusAndEnableButtons(); }
};

thinkBtn.addEventListener('click', () => runNonStreamingInference('think', thinkInferenceApi));
planBtn.addEventListener('click', () => runNonStreamingInference('plan', planInferenceApi));

wonderBtn.addEventListener('click', async () => {
    if (!validateCommonFields()) return;
    setAllButtonsDisabled(true);
    await showStatus('✨ Person is wondering...');
    const payload = {
        scene_id: AppState.selectedSceneId,
        ai_persona_name: AppState.selectedAiPersonaName,
        user_persona_name: AppState.selectedUserAgentName,
        selected_model_id: AppState.selectedInferenceModelId
    };
    let isFirstChunk = true;
    await wonderInferenceApi(payload,
        (chunk) => {
            if (isFirstChunk) { clearStatusForResponse(); isFirstChunk = false; }
            aiResponseTextbox.value += chunk;
            aiResponseTextbox.scrollTop = aiResponseTextbox.scrollHeight;
        },
        () => {
            console.log('Wonder Inference Complete.');
            hideStatusAndEnableButtons();
        },
        (error) => { showNotification(`Wonder Inference Failed: ${error.message}`); clearStatusForResponse(); hideStatusAndEnableButtons(); }
    );
});

evolveBtn.addEventListener('click', async () => {
    if (!AppState.selectedSceneId || !AppState.selectedAiPersonaName || !AppState.selectedInferenceModelId) {
        showNotification('Please select a scene, an AI persona, and an inference model to evolve the play prompt.');
        return;
    }

    setAllButtonsDisabled(true);
    await showStatus('🧠 Agent is evolving its play prompt...');
    
    let finalEvolveResponse = '';

    const payload = {
        scene_id: AppState.selectedSceneId,
        ai_persona_name: AppState.selectedAiPersonaName,
        selected_model_id: AppState.selectedInferenceModelId,
    };

    try {
        let isFirstChunk = true;
        await evolveInferenceApi(payload,
            (chunk) => {
                if (isFirstChunk) { clearStatusForResponse(); isFirstChunk = false; }
                finalEvolveResponse += chunk;
                aiResponseTextbox.value = finalEvolveResponse; // Display in AI response box temporarily
                aiResponseTextbox.scrollTop = aiResponseTextbox.scrollHeight;
            },
            async () => {
                console.log('Evolve Inference Complete. Updating agent play prompt.');
                try {
                    const agentId = AppState.availablePersonAgents.find(a => a.name === AppState.selectedAiPersonaName)?.id;
                    if (!agentId) throw new Error('Selected AI Persona not found in available agents.');

                    const currentAgentDetails = AppState.availablePersonAgents.find(a => a.name === AppState.selectedAiPersonaName);
                    if (!currentAgentDetails) {
                        throw new Error('Could not find current agent details to update.');
                    }

                    const agentUpdatePayload = {
                        ...currentAgentDetails,
                        play_prompt: finalEvolveResponse.trim()
                    };

                    const updateResponse = await fetch(`/agent-editor/api/agents/${agentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(agentUpdatePayload)
                    });

                    if (!updateResponse.ok) {
                        const errorData = await updateResponse.json();
                        throw new Error(errorData.error || `Failed to update agent's play prompt.`);
                    }

                    showNotification('Agent play prompt evolved and saved successfully!');
                    await loadInitialData(); 
                    aiPersonaField.value = AppState.selectedAiPersonaName;
                    userAgentField.value = AppState.selectedUserAgentName;

                } catch (error) {
                    showNotification(`Failed to save evolved play prompt: ${error.message}`);
                } finally {
                    hideStatusAndEnableButtons();
                }
            },
            (error) => {
                showNotification(`Evolve Inference Failed: ${error.message}`);
                clearStatusForResponse();
                hideStatusAndEnableButtons();
            }
        );
    } catch (error) {
        showNotification(`Evolve Inference Failed: ${error.message}`);
        clearStatusForResponse();
        hideStatusAndEnableButtons();
    }
});


autoBtn.addEventListener('click', async () => {
    if (!validateCommonFields()) return;

    setAllButtonsDisabled(true);
    await showStatus('✨ Actor is thinking automatically...', userQueryTextbox);

    let finalActorResponse = '';

    const payload = {
        scene_id: AppState.selectedSceneId,
        user_persona_name: AppState.selectedUserAgentName,
        ai_persona_name: AppState.selectedAiPersonaName,
        selected_model_id: AppState.selectedInferenceModelId,
        refine: refineCheckbox.checked
    };

    try {
        let isFirstChunk = true;
        await autoInferenceApiStreaming(payload,
            (chunk) => {
                if (isFirstChunk) { clearStatusForResponse(userQueryTextbox); isFirstChunk = false; }
                finalActorResponse += chunk;
                userQueryTextbox.value = finalActorResponse;
                userQueryTextbox.scrollTop = userQueryTextbox.scrollHeight;
            },
            () => {
                console.log('Auto Inference Complete.');
                hideStatusAndEnableButtons();
            },
            (error) => { showNotification(`Auto Inference Failed: ${error.message}`); clearStatusForResponse(userQueryTextbox); hideStatusAndEnableButtons(); }
        );
    } catch (error) {
        showNotification(`Auto Inference Failed: ${error.message}`);
        clearStatusForResponse(userQueryTextbox);
        hideStatusAndEnableButtons();
    }
});


saveDialogBtn.addEventListener('click', async () => {
    if (!AppState.selectedSceneId || !aiPersonaField.value || !userAgentField.value || !userQueryTextbox.value.trim() || !aiResponseTextbox.value.trim()) {
        showNotification('A Scene must be selected, and Agent, User, User Query, and Agent Response fields cannot be empty to save.');
        return;
    }
    saveDialogBtn.disabled = true;

    const isUpdate = AppState.currentDialogIndex !== -1 && AppState.currentDialogIndex < AppState.currentSceneDialogs.length;
    const dialogId = isUpdate ? AppState.currentSceneDialogs[AppState.currentDialogIndex].id : null;

    try {
        const dialogData = {
            id: dialogId,
            scene_id: AppState.selectedSceneId,
            ai_persona: AppState.selectedAiPersonaName,
            user_persona: AppState.selectedUserAgentName,
            user_query: userQueryTextbox.value.trim(),
            ai_response: aiResponseTextbox.value.trim(),
            comment: commentTextbox.value.trim(),
            exemplary: exemplaryCheckbox.checked,
            revised: revisedTextarea.value.trim()
        };
        const result = await saveDialogApi(dialogData);

        showNotification('Dialog saved successfully!');
        
        await loadAndDisplaySceneDialogs(AppState.selectedSceneId);
        
        if (isUpdate) {
            const updatedDialog = AppState.currentSceneDialogs.find(d => d.id === dialogId);
            if (updatedDialog) {
                AppState.currentDialogIndex = AppState.currentSceneDialogs.indexOf(updatedDialog);
            }
        } else {
            AppState.currentDialogIndex = AppState.currentSceneDialogs.length - 1;
        }
        await displayCurrentDialog();

    } catch (error) {
        showNotification(`Failed to save dialog: ${error.message || 'Unknown error'}`);
    } finally {
        saveDialogBtn.disabled = false;
    }
});

insertDialogBtn.addEventListener('click', async () => {
    if (!AppState.selectedSceneId) {
        showNotification('Please select a scene first to insert a dialog.');
        return;
    }

    insertDialogBtn.disabled = true;

    const currentDialogs = AppState.currentSceneDialogs;
    const currentIndex = AppState.currentDialogIndex;

    let prevDialogId = null;
    let nextDialogId = null;

    if (currentIndex !== -1 && currentIndex < currentDialogs.length) {
        const previousDialog = currentDialogs[currentIndex];
        prevDialogId = previousDialog.id;

        if (currentIndex + 1 < currentDialogs.length) {
            nextDialogId = currentDialogs[currentIndex + 1].id;
        }
    } else if (currentDialogs.length > 0) {
        const lastDialog = currentDialogs[currentDialogs.length - 1];
        prevDialogId = lastDialog.id;
    }

    try {
        const result = await insertDialogApi(
            AppState.selectedSceneId,
            prevDialogId,
            nextDialogId
        );
        
        await loadAndDisplaySceneDialogs(AppState.selectedSceneId);
        
        const newDialog = AppState.currentSceneDialogs.find(d => d.id === result.id);
        if (newDialog) {
            AppState.currentDialogIndex = AppState.currentSceneDialogs.indexOf(newDialog);
            await displayCurrentDialog();
        }

    } catch (error) {
        showNotification(`Failed to insert dialog: ${error.message || 'Unknown error'}`);
    } finally {
        insertDialogBtn.disabled = false;
    }
});

deleteDialogBtn.addEventListener('click', async () => {
    if (AppState.currentDialogIndex === -1) {
        showNotification('No dialog selected to delete.');
        return;
    }

    const dialogToDelete = AppState.currentSceneDialogs[AppState.currentDialogIndex];
    if (!dialogToDelete) {
        showNotification('Could not find the dialog to delete.');
        return;
    }

    // IMPORTANT: Do NOT use confirm() in production code.
    // This is a placeholder for a custom modal confirmation dialog.
    const confirmed = confirm('Are you sure you want to delete this dialog? This action cannot be undone.');
    if (!confirmed) return;

    setAllButtonsDisabled(true);
    await showStatus('Deleting dialog...');

    try {
        await deleteDialogApi(dialogToDelete.id);
        await loadAndDisplaySceneDialogs(AppState.selectedSceneId);
    } catch (error) {
        showNotification(`Failed to delete dialog: ${error.message || 'Unknown error'}`);
    } finally {
        clearStatusForResponse();
        hideStatusAndEnableButtons();
    }
});


// --- Dialog Navigation Event Listeners ---
dialogPrevBtn.addEventListener('click', async () => {
    if (AppState.currentDialogIndex > 0) {
        AppState.currentDialogIndex--;
        await displayCurrentDialog();
    }
});

dialogNextBtn.addEventListener('click', async () => {
    if (AppState.currentDialogIndex < AppState.currentSceneDialogs.length - 1) {
        AppState.currentDialogIndex++;
        await displayCurrentDialog();
    }
});

reloadCurrentDialogBtn.addEventListener('click', async () => {
    if (AppState.currentSceneDialogs.length > 0) {
        AppState.currentDialogIndex = AppState.currentSceneDialogs.length - 1;
        await displayCurrentDialog();
        console.log('Reloaded current dialog to most recent entry.');
    } else if (AppState.selectedSceneId) {
        await loadAndDisplaySceneDialogs(AppState.selectedSceneId);
        console.log('Attempted to reload dialogs for the current scene.');
    } else {
        console.log('No scene selected or no dialogs to reload.');
    }
});

clearTextFieldsBtn.addEventListener('click', () => {
    userQueryTextbox.value = '';
    aiResponseTextbox.value = '';
    console.log('Actor and Responder text fields cleared.');
});

vocabBtn.addEventListener('click', async () => {
    const { selectionStart, selectionEnd, value } = aiResponseTextbox;
    const selectedText = value.substring(selectionStart, selectionEnd).trim();

    if (!selectedText) {
        showNotification('Please select some text in the Responder field to create a vocab entry.');
        return;
    }

    const isUpdate = AppState.currentDialogIndex !== -1 && AppState.currentDialogIndex < AppState.currentSceneDialogs.length;
    if (!isUpdate) {
        showNotification('Please save the current dialog before creating a vocab entry.');
        return;
    }
    
    const dialogId = AppState.currentSceneDialogs[AppState.currentDialogIndex].id;

    if (!AppState.selectedInferenceModelId) {
        showNotification('Please select an inference model.');
        return;
    }

    setAllButtonsDisabled(true);
    const originalButtonContent = vocabBtn.innerHTML;
    vocabBtn.innerHTML = '<span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span>';

    try {
        const vocabData = {
            dialog_id: dialogId,
            selected_text: selectedText,
            full_context_text: aiResponseTextbox.value,
            selected_model_id: AppState.selectedInferenceModelId,
        };
        const result = await createVocabEntryApi(vocabData);
        showNotification(`Vocab entry created successfully! (ID: ${result.id})`);
    } catch (error) {
        showNotification(`Failed to create vocab entry: ${error.message || 'Unknown error'}`);
    } finally {
        vocabBtn.innerHTML = originalButtonContent;
        hideStatusAndEnableButtons();
    }
});

// NEW: Event listener for the keyboard button
keyboardBtn.addEventListener('click', () => {
    // Determine which textarea has focus, default to aiResponseTextbox
    const targetEl = document.activeElement === userQueryTextbox ? userQueryTextbox : aiResponseTextbox;
    openKoreanKeyboard(targetEl, (finalText) => {
        targetEl.value = finalText;
    });
});


// --- Collapsible Sections Logic ---
const initializeCollapsibles = () => {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                content.style.padding = '0 15px';
            } else {
                content.style.padding = '15px';
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });
};


document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    // Initialize the new multi-language keyboard
    initKoreanKeyboard(); 
    setTimeout(() => {
        initializeCollapsibles();
    }, 100);
});