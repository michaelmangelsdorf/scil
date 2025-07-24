// scene-edit/public/script.js

document.addEventListener('DOMContentLoaded', () => {
    const sceneList = document.getElementById('scene-list');
    const sceneNameInput = document.getElementById('scene-name');
    const sceneAfterInput = document.getElementById('scene-after');
    const sceneSynopsisTextarea = document.getElementById('scene-synopsis');
    const sceneCanonTextarea = document.getElementById('scene-canon');
    const saveSceneBtn = document.getElementById('save-scene-btn');
    const deleteSceneBtn = document.getElementById('delete-scene-btn');
    const newSceneBtn = document.getElementById('new-scene-btn');
    const sceneIncludeCheckbox = document.getElementById('scene-include'); // New checkbox for scene details

    const dialogList = document.getElementById('dialog-list');
    const dialogAiPersonaInput = document.getElementById('dialog-ai-persona');
    const dialogUserPersonaInput = document.getElementById('dialog-user-persona');
    const dialogUserQueryTextarea = document.getElementById('dialog-user-query');
    const dialogAiResponseTextarea = document.getElementById('dialog-ai-response');
    const dialogCommentTextarea = document.getElementById('dialog-comment');
    const saveDialogBtn = document.getElementById('save-dialog-btn');
    const deleteDialogBtn = document.getElementById('delete-dialog-btn');
    const newDialogBtn = document.getElementById('new-dialog-btn');

    const summarizerSelect = document.getElementById('summarizer-select'); // Changed from reduxAgentSelect
    const applySceneClosureBtn = document.getElementById('apply-scene-closure-btn');
    const closureStatusMessage = document.getElementById('closure-status-message');

    const clearDbBtn = document.getElementById('clear-db-btn');

    // Custom Modal Elements
    const customModal = document.getElementById('custom-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    // Removed DEBUGGING LOGS

    let modalResolve; // To store the promise resolve function for the modal

    // Function to show custom confirmation modal
    const showConfirmModal = (message) => {
        modalMessage.textContent = message;
        customModal.classList.add('show');
        return new Promise(resolve => {
            modalResolve = resolve;
        });
    };

    modalConfirmBtn.addEventListener('click', () => {
        customModal.classList.remove('show');
        if (modalResolve) modalResolve(true);
    });

    modalCancelBtn.addEventListener('click', () => {
        customModal.classList.remove('show');
        if (modalResolve) modalResolve(false);
    });


    let selectedScene = null;
    let selectedDialog = null;
    let availableSummarizers = []; // Changed from availableReduxAgents

    const API_BASE_PATH = '/scene-editor/api';

    const getTruncatedText = (text, maxLength) => {
        if (!text) return '';
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    };

    // --- Scene Management ---

    const fetchScenes = async () => {
        try {
            const response = await fetch(`${API_BASE_PATH}/scenes`);
            const scenes = await response.json();
            renderScenes(scenes);
        } catch (error) {
            console.error('Error fetching scenes:', error);
            // Replaced with custom modal or direct message
            closureStatusMessage.textContent = 'Failed to load scenes.';
            closureStatusMessage.style.color = 'red';
        }
    };

    const renderScenes = (scenes) => {
        sceneList.innerHTML = '';
        scenes.forEach(scene => {
            const li = document.createElement('li');
            li.dataset.sceneId = scene.scene_id;
            li.dataset.id = scene.id;
            li.draggable = true;

            // Checkbox for 'include' status
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = scene.include === 1; // SQLite stores BOOLEAN as 0 or 1
            checkbox.classList.add('scene-include-checkbox');
            checkbox.addEventListener('change', async (e) => {
                const newIncludeStatus = e.target.checked;
                try {
                    const response = await fetch(`${API_BASE_PATH}/scenes/${scene.scene_id}/include`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ include: newIncludeStatus ? 1 : 0 })
                    });
                    if (response.ok) {
                        console.log(`Scene ${scene.scene_id} include status updated to ${newIncludeStatus}`);
                        // Update the UI immediately
                        if (newIncludeStatus) {
                            li.classList.remove('greyed-out');
                        } else {
                            li.classList.add('greyed-out');
                        }
                        // If this is the currently selected scene, update its checkbox in details section
                        if (selectedScene && selectedScene.scene_id === scene.scene_id) {
                            sceneIncludeCheckbox.checked = newIncludeStatus;
                        }
                    } else {
                        const errorData = await response.json();
                        console.error('Failed to update include status:', errorData.error);
                        closureStatusMessage.textContent = `Failed to update include status: ${errorData.error}`;
                        closureStatusMessage.style.color = 'red';
                        e.target.checked = !newIncludeStatus; // Revert checkbox state on error
                    }
                } catch (error) {
                    console.error('Error updating include status:', error);
                    closureStatusMessage.textContent = 'Failed to update include status due to network error.';
                    closureStatusMessage.style.color = 'red';
                    e.target.checked = !newIncludeStatus; // Revert checkbox state on error
                }
            });
            li.appendChild(checkbox);

            // Scene name and token counts
            const nameSpan = document.createElement('span');
            nameSpan.textContent = scene.name;
            nameSpan.classList.add('scene-name-text');
            li.appendChild(nameSpan);

            const tokenSpan = document.createElement('span');
            tokenSpan.classList.add('scene-token-counts');
            tokenSpan.textContent = ` (${scene.estimated_dialog_tokens || 0}, ${scene.estimated_scene_tokens || 0})`;
            li.appendChild(tokenSpan);

            if (scene.include === 0) { // Apply greyed-out class if not included
                li.classList.add('greyed-out');
            }

            sceneList.appendChild(li);
        });
        setupSceneDragAndDrop();
        if (selectedScene) {
            const currentSelected = sceneList.querySelector(`li[data-scene-id="${selectedScene.scene_id}"]`);
            if (currentSelected) {
                currentSelected.classList.add('selected');
            } else {
                clearSceneFields();
            }
        }
    };

    const selectScene = async (sceneId) => {
        try {
            const response = await fetch(`${API_BASE_PATH}/scenes/${sceneId}`);
            const scene = await response.json();
            selectedScene = scene;

            sceneNameInput.value = scene.name;
            sceneAfterInput.value = scene.after;
            sceneSynopsisTextarea.value = scene.synopsis;
            sceneCanonTextarea.value = scene.canon;
            sceneIncludeCheckbox.checked = scene.include === 1; // Set checkbox state

            document.querySelectorAll('#scene-list li').forEach(li => li.classList.remove('selected'));
            const currentSceneLi = document.querySelector(`#scene-list li[data-scene-id="${sceneId}"]`);
            if (currentSceneLi) {
                currentSceneLi.classList.add('selected');
            }

            await fetchDialogs(sceneId);
        } catch (error) {
            console.error('Error selecting scene:', error);
            closureStatusMessage.textContent = 'Failed to load scene details.';
            closureStatusMessage.style.color = 'red';
        }
    };

    const clearSceneFields = () => {
        selectedScene = null;
        sceneNameInput.value = '';
        sceneAfterInput.value = '1H';
        sceneSynopsisTextarea.value = '';
        sceneCanonTextarea.value = '';
        sceneIncludeCheckbox.checked = true; // Default to checked for new scenes
        document.querySelectorAll('#scene-list li').forEach(li => li.classList.remove('selected'));
        clearDialogFields();
        dialogList.innerHTML = '';
        closureStatusMessage.textContent = ''; // Clear previous closure status
        closureStatusMessage.style.color = ''; // Reset color
    };

    saveSceneBtn.addEventListener('click', async () => {
        const name = sceneNameInput.value.trim();
        const after = sceneAfterInput.value.trim();
        const synopsis = sceneSynopsisTextarea.value.trim();
        const canon = sceneCanonTextarea.value.trim();
        const include = sceneIncludeCheckbox.checked ? 1 : 0; // Get include status from checkbox

        if (!name) {
            showConfirmModal('Scene name cannot be empty.').then(() => {}); // Use modal
            return;
        }

        const body = {
            scene_id: selectedScene ? selectedScene.scene_id : undefined,
            name,
            synopsis,
            canon,
            after,
            include // Include the new field
        };

        try {
            const response = await fetch(`${API_BASE_PATH}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (response.ok) {
                closureStatusMessage.textContent = result.message;
                closureStatusMessage.style.color = 'green';
                setTimeout(() => closureStatusMessage.textContent = '', 3000);

                await fetchScenes();
                if (!selectedScene && result.scene_id) {
                    selectScene(result.scene_id);
                } else if (selectedScene) {
                    selectScene(selectedScene.scene_id);
                }
            } else {
                closureStatusMessage.textContent = `Error: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error saving scene:', error);
            closureStatusMessage.textContent = 'Failed to save scene.';
            closureStatusMessage.style.color = 'red';
        }
    });

    deleteSceneBtn.addEventListener('click', async () => {
        if (!selectedScene) {
            showConfirmModal('No scene selected to delete.').then(() => {});
            return;
        }

        const confirmed = await showConfirmModal(`Are you sure you want to delete scene "${selectedScene.name}" and all its dialogs?`);
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_PATH}/scenes/${selectedScene.scene_id}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (response.ok) {
                closureStatusMessage.textContent = result.message;
                closureStatusMessage.style.color = 'green';
                setTimeout(() => closureStatusMessage.textContent = '', 3000);
                clearSceneFields();
                fetchScenes();
            } else {
                closureStatusMessage.textContent = `Error: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error deleting scene:', error);
            closureStatusMessage.textContent = 'Failed to delete scene.';
            closureStatusMessage.style.color = 'red';
        }
    });

    newSceneBtn.addEventListener('click', () => {
        clearSceneFields();
        closureStatusMessage.textContent = 'Fields cleared for new scene!';
        closureStatusMessage.style.color = 'blue';
        setTimeout(() => {
            closureStatusMessage.textContent = '';
            closureStatusMessage.style.color = '';
        }, 3000);
    });

    sceneList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        // Ensure click is not on the checkbox itself, but on the list item
        if (li && li.dataset.sceneId && e.target.type !== 'checkbox') {
            selectScene(li.dataset.sceneId);
        }
    });

    // --- Scene Drag and Drop Reordering ---
    let draggedItem = null;

    function setupSceneDragAndDrop() {
        const sceneItems = sceneList.querySelectorAll('li');
        sceneItems.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
        });
    }

    function handleDragStart(e) {
        draggedItem = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        e.target.classList.add('dragging');
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('li');
        if (target && target !== draggedItem) {
            const boundingBox = target.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);
            if (e.clientY > offset) {
                sceneList.insertBefore(draggedItem, target.nextSibling);
            } else {
                sceneList.insertBefore(draggedItem, target);
            }
        }
    }

    function handleDrop(e) {
        e.preventDefault();
    }

    async function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        draggedItem = null;

        const newOrder = Array.from(sceneList.children).map((li, index) => ({
            scene_id: parseInt(li.dataset.sceneId),
            sortcode: index
        }));

        try {
            const response = await fetch(`${API_BASE_PATH}/scenes/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sceneOrder: newOrder })
            });
            const result = await response.json();
            if (response.ok) {
                console.log(result.message);
            } else {
                closureStatusMessage.textContent = `Error reordering scenes: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
                fetchScenes();
            }
        } catch (error) {
            console.error('Error reordering scenes:', error);
            closureStatusMessage.textContent = 'Failed to reorder scenes.';
            closureStatusMessage.style.color = 'red';
            fetchScenes();
        }
    }

    // --- Dialog Management ---

    const MAX_DIALOG_SNIPPET_LENGTH = 35;
    const HALF_SNIPPET_LENGTH = Math.floor((MAX_DIALOG_SNIPPET_LENGTH - 3) / 2);

    const fetchDialogs = async (sceneId) => {
        try {
            const response = await fetch(`${API_BASE_PATH}/dialogs/${sceneId}`);
            const dialogs = await response.json();
            renderDialogs(dialogs);
        } catch (error) {
            console.error('Error fetching dialogs:', error);
            closureStatusMessage.textContent = 'Failed to load dialogs.';
            closureStatusMessage.style.color = 'red';
        }
    };

    const renderDialogs = (dialogs) => {
        dialogList.innerHTML = '';
        dialogs.forEach(dialog => {
            const li = document.createElement('li');
            const userQuerySnippet = getTruncatedText(dialog.user_query, HALF_SNIPPET_LENGTH);
            const aiResponseSnippet = getTruncatedText(dialog.ai_response, HALF_SNIPPET_LENGTH);
            li.textContent = `${userQuerySnippet} ... ${aiResponseSnippet}`;
            li.dataset.dialogId = dialog.id;
            li.draggable = true;
            dialogList.appendChild(li);
        });
        setupDialogDragAndDrop();
        if (selectedDialog) {
            const currentSelected = dialogList.querySelector(`li[data-dialog-id="${selectedDialog.id}"]`);
            if (currentSelected) {
                currentSelected.classList.add('selected');
            } else {
                clearDialogFields();
            }
        }
    };

    const selectDialog = async (dialogId) => {
        try {
            const response = await fetch(`${API_BASE_PATH}/dialog/${dialogId}`);
            const dialog = await response.json();
            selectedDialog = dialog;

            dialogAiPersonaInput.value = dialog.ai_persona || ''; // Changed from 'None' to empty string for editable field
            dialogUserPersonaInput.value = dialog.user_persona || '';

            dialogUserQueryTextarea.value = dialog.user_query;
            dialogAiResponseTextarea.value = dialog.ai_response;
            dialogCommentTextarea.value = dialog.comment;

            document.querySelectorAll('#dialog-list li').forEach(li => li.classList.remove('selected'));
            const currentDialogLi = document.querySelector(`#dialog-list li[data-dialog-id="${dialogId}"]`);
            if (currentDialogLi) {
                currentDialogLi.classList.add('selected');
            }
        } catch (error) {
            console.error('Error selecting dialog:', error);
            closureStatusMessage.textContent = 'Failed to load dialog details.';
            closureStatusMessage.style.color = 'red';
        }
    };

    const clearDialogFields = () => {
        selectedDialog = null;
        dialogAiPersonaInput.value = ''; // Ensure it clears to empty for editable field
        dialogUserPersonaInput.value = '';
        dialogUserQueryTextarea.value = '';
        dialogAiResponseTextarea.value = '';
        dialogCommentTextarea.value = '';
        document.querySelectorAll('#dialog-list li').forEach(li => li.classList.remove('selected'));
    };

    saveDialogBtn.addEventListener('click', async () => {
        if (!selectedScene) {
            showConfirmModal('Please select a scene first.').then(() => {});
            return;
        }

        const ai_persona_input_value = dialogAiPersonaInput.value.trim();
        const user_persona_input_value = dialogUserPersonaInput.value.trim();
        const user_query = dialogUserQueryTextarea.value.trim();
        const ai_response = dialogAiResponseTextarea.value.trim();
        const comment = dialogCommentTextarea.value.trim();

        let ai_persona_to_send = ai_persona_input_value;
        if (ai_persona_input_value === '') { // If empty, send null
            ai_persona_to_send = null;
        }

        let user_persona_to_send = user_persona_input_value;
        if (user_persona_input_value === '') { // If empty, send null
            user_persona_to_send = null;
        }

        const body = {
            scene_id: selectedScene.scene_id,
            ai_persona: ai_persona_to_send,
            user_persona: user_persona_to_send,
            user_query,
            ai_response,
            comment
        };

        const method = 'POST';
        const url = `${API_BASE_PATH}/dialogs`;

        if (selectedDialog) {
            body.id = selectedDialog.id;
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (response.ok) {
                closureStatusMessage.textContent = result.message;
                closureStatusMessage.style.color = 'green';
                setTimeout(() => closureStatusMessage.textContent = '', 3000);
                fetchDialogs(selectedScene.scene_id);
                // Re-fetch scenes to update token counts
                fetchScenes();
                if (!selectedDialog && result.id) {
                    selectDialog(result.id);
                } else if (selectedDialog) {
                    selectDialog(selectedDialog.id);
                }
            } else {
                closureStatusMessage.textContent = `Error: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error saving dialog:', error);
            closureStatusMessage.textContent = 'Failed to save dialog.';
            closureStatusMessage.style.color = 'red';
        }
    });

    deleteDialogBtn.addEventListener('click', async () => {
        if (!selectedDialog) {
            showConfirmModal('No dialog selected to delete.').then(() => {});
            return;
        }

        const confirmed = await showConfirmModal('Are you sure you want to delete this dialog?');
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_PATH}/dialogs/${selectedDialog.id}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (response.ok) {
                closureStatusMessage.textContent = result.message;
                closureStatusMessage.style.color = 'green';
                setTimeout(() => closureStatusMessage.textContent = '', 3000);
                clearDialogFields();
                if (selectedScene) {
                    fetchDialogs(selectedScene.scene_id);
                    // Re-fetch scenes to update token counts
                    fetchScenes();
                }
            } else {
                closureStatusMessage.textContent = `Error: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error deleting dialog:', error);
            closureStatusMessage.textContent = 'Failed to delete dialog.';
            closureStatusMessage.style.color = 'red';
        }
    });

    newDialogBtn.addEventListener('click', () => {
        if (!selectedScene) {
            showConfirmModal('Please select a scene first to add a dialog.').then(() => {});
            return;
        }
        clearDialogFields();
        dialogAiPersonaInput.value = ''; // Initialize as empty, not 'None'
        dialogUserPersonaInput.value = '';
        dialogUserQueryTextarea.focus();
    });

    dialogList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.dialogId) {
            selectDialog(li.dataset.dialogId);
        }
    });

    // --- Dialog Drag and Drop Reordering ---
    let draggedDialogItem = null;

    function setupDialogDragAndDrop() {
        const dialogItems = dialogList.querySelectorAll('li');
        dialogItems.forEach(item => {
            item.addEventListener('dragstart', handleDialogDragStart);
            item.addEventListener('dragover', handleDialogDragOver);
            item.addEventListener('drop', handleDialogDrop);
            item.addEventListener('dragend', handleDialogDragEnd);
        });
    }

    function handleDialogDragStart(e) {
        draggedDialogItem = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        e.target.classList.add('dragging');
    }

    function handleDialogDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('li');
        if (target && target !== draggedDialogItem) {
            const boundingBox = target.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);
            if (e.clientY > offset) {
                dialogList.insertBefore(draggedDialogItem, target.nextSibling);
            } else {
                dialogList.insertBefore(draggedDialogItem, target);
            }
        }
    }

    function handleDialogDrop(e) {
        e.preventDefault();
    }

    async function handleDialogDragEnd(e) {
        e.target.classList.remove('dragging');
        draggedDialogItem = null;

        const newOrder = Array.from(dialogList.children).map((li, index) => ({
            id: parseInt(li.dataset.dialogId),
            sortcode: index
        }));

        try {
            const response = await fetch(`${API_BASE_PATH}/dialogs/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dialogOrder: newOrder })
            });
            const result = await response.json();
            if (response.ok) {
                console.log(result.message);
            } else {
                closureStatusMessage.textContent = `Error reordering dialogs: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
                fetchDialogs(selectedScene.scene_id);
            }
        } catch (error) {
            console.error('Error reordering dialogs:', error);
            closureStatusMessage.textContent = 'Failed to reorder dialogs.';
            closureStatusMessage.style.color = 'red';
            fetchDialogs(selectedScene.scene_id);
        }
    }

    // --- Scene Closure Logic ---

    const fetchSummarizers = async () => { // Changed from fetchReduxAgents
        summarizerSelect.innerHTML = '<option value="">Loading Summarizers...</option>'; // Changed text
        try {
            const response = await fetch(`${API_BASE_PATH}/agents/summarizer`); // Changed API path
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const agents = await response.json();
            availableSummarizers = agents; // Changed from availableReduxAgents

            let optionsHtml = '<option value="">Choose an agent of type Summarizer</option>'; // Added this as the primary default option

            if (availableSummarizers && availableSummarizers.length > 0) { // Changed from availableReduxAgents
                availableSummarizers.forEach(agent => { // Changed from availableReduxAgents
                    optionsHtml += `<option value="${agent.name}">${agent.name}</option>`;
                });
            } else {
                // If no agents found, add a disabled option indicating that, without a trailing period.
                optionsHtml += '<option value="" disabled>No Summarizers found</option>'; // Removed period
            }
            summarizerSelect.innerHTML = optionsHtml;

        } catch (error) {
            console.error('Error fetching Summarizers:', error); // Changed text
            summarizerSelect.innerHTML = '<option value="" disabled>Error loading agents</option>'; // Keep this for error state
            closureStatusMessage.textContent = 'Failed to load Summarizers.'; // Changed text
            closureStatusMessage.style.color = 'red';
        }
    };

    applySceneClosureBtn.addEventListener('click', async () => {
        if (!selectedScene) {
            showConfirmModal('Please select a scene first.').then(() => {});
            return;
        }
        const selectedSummarizerName = summarizerSelect.value; // Changed from selectedReduxAgentName
        if (!selectedSummarizerName) {
            showConfirmModal('Please select a Summarizer.').then(() => {}); // Changed text
            return;
        }

        closureStatusMessage.textContent = 'Generating synopsis...';
        closureStatusMessage.style.color = '';
        applySceneClosureBtn.disabled = true;

        try {
            const sceneDetailsResponse = await fetch(`${API_BASE_PATH}/scenes/${selectedScene.scene_id}`);
            if (!sceneDetailsResponse.ok) throw new Error('Failed to fetch current scene details.');
            const sceneDetails = await sceneDetailsResponse.json();

            const dialogsResponse = await fetch(`${API_BASE_PATH}/dialogs/${selectedScene.scene_id}`);
            if (!dialogsResponse.ok) throw new Error('Failed to fetch scene dialogs.');
            const sceneDialogs = await dialogsResponse.json();

            const messages = [];

            const summarizerAgent = availableSummarizers.find(agent => agent.name === selectedSummarizerName); // Changed from reduxAgent and availableReduxAgents
            if (!summarizerAgent || !summarizerAgent.play_prompt) { // Changed from reduxAgent
                throw new Error(`Summarizer '${selectedSummarizerName}' not found or has no play_prompt.`); // Changed text
            }
            messages.push({ role: "system", content: summarizerAgent.play_prompt }); // Changed from reduxAgent

            if (sceneDetails.canon) {
                messages.push({ role: "user", content: `Scene Canon: ${sceneDetails.canon}` });
                messages.push({ role: "assistant", content: "Acknowledged." });
            }
            if (sceneDetails.synopsis) {
                messages.push({ role: "user", content: `Previous Synopsis: ${sceneDetails.synopsis}` });
                messages.push({ role: "assistant", content: "Acknowledged." });
            }

            sceneDialogs.forEach(dialog => {
                const userQueryContent = dialog.user_persona ? `${dialog.user_persona}: ${dialog.user_query}` : dialog.user_query;
                messages.push({ role: "user", content: userQueryContent });
                messages.push({ role: "assistant", content: dialog.ai_response });
            });

            messages.push({ role: "user", content: "Based on the above scene details and dialogs, please generate a concise, updated synopsis for this scene." });

            const inferenceResponse = await fetch(`${API_BASE_PATH}/summarizer-inference`, { // Changed API path from redux-inference
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages,
                    selected_model_id: 'gpt-3.5-turbo'
                })
            });

            if (!inferenceResponse.ok) {
                const errorData = await inferenceResponse.json();
                throw new Error(errorData.error || 'Failed to perform Summarizer inference.'); // Changed text
            }

            const result = await inferenceResponse.json();
            const newSynopsis = result.generated_text;

            if (newSynopsis) {
                sceneSynopsisTextarea.value = newSynopsis;
                closureStatusMessage.textContent = 'Synopsis generated and updated!';
                closureStatusMessage.style.color = 'green';

                const saveResponse = await fetch(`${API_BASE_PATH}/scenes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scene_id: selectedScene.scene_id,
                        name: sceneNameInput.value.trim(),
                        synopsis: newSynopsis,
                        canon: sceneCanonTextarea.value.trim(),
                        after: sceneAfterInput.value.trim(),
                        include: sceneIncludeCheckbox.checked ? 1 : 0 // Save current include status
                    })
                });

                if (!saveResponse.ok) {
                    const saveErrorData = await saveResponse.json();
                    throw new Error(saveErrorData.error || 'Failed to save updated synopsis to database.');
                }
                console.log('Updated synopsis saved to database.');
                // Re-fetch scenes to update token counts after synopsis update
                fetchScenes();
            } else {
                closureStatusMessage.textContent = 'No synopsis generated.';
                closureStatusMessage.style.color = 'orange';
            }

        } catch (error) {
            console.error('Error applying scene closure:', error);
            closureStatusMessage.textContent = `Error: ${error.message}`;
            closureStatusMessage.style.color = 'red';
        } finally {
            applySceneClosureBtn.disabled = false;
        }
    });

    // --- Clear Database ---
    clearDbBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal('WARNING: This will delete ALL scenes and dialogs and cannot be undone. Are you absolutely sure?');
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_PATH}/clear-database`, {
                method: 'POST'
            });
            const result = await response.json();
            if (response.ok) {
                closureStatusMessage.textContent = result.message;
                closureStatusMessage.style.color = 'green';
                setTimeout(() => closureStatusMessage.textContent = '', 3000);
                clearSceneFields();
                fetchScenes();
            } else {
                closureStatusMessage.textContent = `Error clearing database: ${result.error || result.message}`;
                closureStatusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error clearing database:', error);
            closureStatusMessage.textContent = 'Failed to clear database.';
            closureStatusMessage.style.color = 'red';
        }
    });

    // Initial load
    fetchScenes();
    fetchSummarizers(); // Changed from fetchReduxAgents
});
