document.addEventListener('DOMContentLoaded', () => {
    const agentSelect = document.getElementById('agent-select');
    const modelSelect = document.getElementById('model-select');
    const modelPickerGroup = document.getElementById('model-picker-group');
    const modelPreferredDisplay = document.getElementById('model-preferred-display');
    const dialogListbox = document.getElementById('dialog-listbox');
    const userQueryDisplay = document.getElementById('user-query-display');
    const agentResponseDisplay = document.getElementById('agent-response-display');
    const revisedResponseDisplay = document.getElementById('revised-response-display');
    const userCommentDisplay = document.getElementById('user-comment-display');
    const generateGuideBtn = document.getElementById('generate-guide-btn');
    const styleGuideText = document.getElementById('style-guide-text');
    const saveGuideBtn = document.getElementById('save-guide-btn');
    const saveDialogBtn = document.getElementById('save-dialog-btn');
    const statusMessage = document.getElementById('status-message');
    const modelSelectionSection = document.getElementById('model-selection-section');

    let agents = [];
    let dialogs = [];
    let availableModels = [];
    let selectedDialogId = null;

    // --- INITIALIZATION ---

    async function initialize() {
        try {
            const agentRes = await fetch('/styler/api/agents');
            agents = await agentRes.json();
            agentSelect.innerHTML = '<option value="">Select an Agent</option>';
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.name;
                agentSelect.appendChild(option);
            });

            const modelRes = await fetch('/styler/api/lm-studio/models');
            if (!modelRes.ok) {
                if (modelRes.status === 503) {
                    const errorData = await modelRes.json();
                    alert("Model files not found - please check .env file or select LM Studio option in settings");
                    window.location.href = '/settings';
                    return;
                }
                throw new Error(`Server error: ${modelRes.status}`);
            }
            const modelData = await modelRes.json();

            if (modelData.isLmStudio === false) {
                if (modelSelectionSection) modelSelectionSection.style.display = 'none';
            }
            
            availableModels = modelData.data;
            const preferredModelId = modelData.preferredModel;

            if (preferredModelId) {
                const preferredModel = availableModels.find(m => m.id === preferredModelId);
                if (preferredModel) {
                    modelPickerGroup.classList.add('hidden');
                    modelPreferredDisplay.classList.remove('hidden');
                    modelPreferredDisplay.textContent = `Using preferred model: ${preferredModel.id}`;
                    modelSelect.innerHTML = `<option value="${preferredModel.id}">${preferredModel.id}</option>`;
                    modelSelect.value = preferredModel.id;
                } else {
                    modelPickerGroup.classList.remove('hidden');
                    modelPreferredDisplay.classList.add('hidden');
                    statusMessage.textContent = `Preferred model "${preferredModelId}" not found. Please select an available model.`;
                    populateModelSelect(availableModels);
                }
            } else {
                modelPickerGroup.classList.remove('hidden');
                modelPreferredDisplay.classList.add('hidden');
                populateModelSelect(availableModels);
            }

        } catch (error) {
            console.error("Initialization failed:", error);
            statusMessage.textContent = "Error loading initial data. Is LM Studio running and configured?";
            modelSelect.innerHTML = '<option value="">Error loading models</option>';
            modelSelect.disabled = true;
        } finally {
            initializeCollapsibles();
        }
    }

    function populateModelSelect(models) {
        modelSelect.innerHTML = '<option value="">Select a Model</option>';
        if (models && models.length > 0) {
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.id;
                modelSelect.appendChild(option);
            });
            modelSelect.disabled = false;
            if (modelSelect.options.length > 1) {
                modelSelect.selectedIndex = 1;
            }
        } else {
            modelSelect.innerHTML = '<option value="">No models found. Is LM Studio running?</option>';
            modelSelect.disabled = true;
        }
    }


    // --- EVENT LISTENERS ---

    agentSelect.addEventListener('change', async (e) => {
        const agentId = e.target.value;
        dialogListbox.innerHTML = '';
        styleGuideText.value = '';
        clearDialogDetails();
        generateGuideBtn.disabled = true;
        saveGuideBtn.disabled = true;
        saveDialogBtn.disabled = true;

        if (!agentId) return;

        const selectedAgent = agents.find(a => a.id == agentId);
        styleGuideText.value = selectedAgent.style_guide || '';

        try {
            const res = await fetch(`/styler/api/dialogs/${selectedAgent.name}`);
            dialogs = await res.json();
            if (dialogs.length === 0) {
                dialogListbox.innerHTML = '<option>No dialogs with comments found for this agent.</option>';
                return;
            }
            dialogs.forEach(dialog => {
                const option = document.createElement('option');
                option.value = dialog.id;
                option.textContent = `Dialog ${dialog.id}: ${dialog.user_query.substring(0, 50)}...`;
                dialogListbox.appendChild(option);
            });
            generateGuideBtn.disabled = false;
            saveGuideBtn.disabled = false;
        } catch (error) {
            console.error("Failed to fetch dialogs:", error);
            statusMessage.textContent = 'Error fetching dialogs.';
        }
    });

    dialogListbox.addEventListener('change', (e) => {
        selectedDialogId = e.target.value;
        const selectedDialog = dialogs.find(d => d.id == selectedDialogId);
        if (selectedDialog) {
            populateDialogDetails(selectedDialog);
        }
    });

    saveDialogBtn.addEventListener('click', async () => {
        if (!selectedDialogId) {
            alert('Please select a dialog to save.');
            return;
        }
        setStatus('Saving dialog feedback...', true);
        try {
            const response = await fetch(`/styler/api/dialogs/${selectedDialogId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comment: userCommentDisplay.value,
                    revised: revisedResponseDisplay.value
                })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            setStatus('Dialog feedback saved successfully!', false);
        } catch (error) {
            console.error('Failed to save dialog feedback:', error);
            setStatus(`Error: ${error.message}`, false);
        }
    });

    generateGuideBtn.addEventListener('click', async () => {
        const selectedModelId = modelSelect.value;
        if (!selectedModelId) {
            alert('Please select a model for generation first.');
            return;
        }
        if (dialogs.length === 0) {
            alert('No dialogs with feedback to process.');
            return;
        }
        
        setStatus('Generating style guide... please wait.', true);
        try {
            const res = await fetch('/styler/api/generate-style-guide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dialogs, selected_model_id: selectedModelId })
            });
            if (!res.ok) throw new Error((await res.json()).error);

            const data = await res.json();
            styleGuideText.value = data.style_guide;
            setStatus('Style guide generated successfully!', false);
        } catch (error) {
            console.error('Failed to generate style guide:', error);
            setStatus(`Error: ${error.message}`, false);
        }
    });

    saveGuideBtn.addEventListener('click', async () => {
        const agentId = agentSelect.value;
        if (!agentId) {
            alert('Please select an agent first.');
            return;
        }
        setStatus('Saving style guide...', true);
        try {
            const res = await fetch('/styler/api/save-style-guide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId: agentId, styleGuide: styleGuideText.value })
            });
             if (!res.ok) throw new Error((await res.json()).error);
            setStatus('Style guide saved successfully!', false);
        } catch (error) {
            console.error('Failed to save style guide:', error);
            setStatus(`Error: ${error.message}`, false);
        }
    });

    // --- HELPER FUNCTIONS ---

    function setStatus(message, isLoading) {
        statusMessage.textContent = message;
        generateGuideBtn.disabled = isLoading;
        saveGuideBtn.disabled = isLoading;
        saveDialogBtn.disabled = isLoading;
    }

    function clearDialogDetails() {
        userQueryDisplay.value = '';
        agentResponseDisplay.value = '';
        revisedResponseDisplay.value = '';
        userCommentDisplay.value = '';
        selectedDialogId = null;
        saveDialogBtn.disabled = true;
    }

    function populateDialogDetails(dialog) {
        userQueryDisplay.value = dialog.user_query;
        agentResponseDisplay.value = dialog.ai_response;
        revisedResponseDisplay.value = dialog.revised || '';
        userCommentDisplay.value = dialog.comment;
        saveDialogBtn.disabled = false;
    }

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

    initialize();
});