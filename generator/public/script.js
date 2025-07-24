document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const storyNameInput = document.getElementById('story-name');
    const storyOutlineInput = document.getElementById('story-outline');
    const saveWorldBtn = document.getElementById('save-world-btn');
    const characterList = document.getElementById('character-list');
    const characterNameInput = document.getElementById('character-name');
    const characterDescriptionInput = document.getElementById('character-description');
    const modelSection = document.getElementById('model-section');
    const modelStatusText = document.getElementById('model-status-text');
    const modelPickerGroup = document.getElementById('model-picker-group');
    const modelSelect = document.getElementById('model-select');
    const newCharBtn = document.getElementById('new-char-btn');
    const createCharBtn = document.getElementById('create-char-btn');
    const inventCharBtn = document.getElementById('invent-char-btn');
    const statusMessage = document.getElementById('status-message');
    const generationProgress = document.getElementById('generation-progress');
    const progressList = document.getElementById('progress-list');

    const modelConfigHeader = document.getElementById('model-config-header');
    const modelConfigContent = document.getElementById('model-config-content');

    const worldDataHeader = document.getElementById('world-data-header');
    const worldDataContent = document.getElementById('world-data-content');

    let agents = [];
    let selectedAgentId = null;

    // --- Helper: Stream Reader ---
    const readStream = async (response, onChunk, onComplete, onError) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonString = line.substring(6);
                        if (jsonString === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(jsonString);
                            if (parsed.content) {
                                fullText += parsed.content;
                                onChunk(fullText);
                            }
                        } catch (e) { /* Ignore parsing errors */ }
                    }
                }
            }
            onComplete(fullText);
        } catch (error) {
            onError(error);
        }
    };

    // --- API Functions ---
    const getState = async (key) => {
        try {
            const res = await fetch(`/generator/api/state/world_data/${key}`);
            if (!res.ok) return null;
            return (await res.json()).value;
        } catch (e) { return null; }
    };
    const saveState = async (key, value) => {
        const response = await fetch('/generator/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: 'world_data', key, value })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to save state.' }));
            throw new Error(errorData.error);
        }
    };
    const fetchAgents = async () => {
        try {
            const res = await fetch('/generator/api/agents');
            agents = await res.json();
            renderAgentList();
        } catch (error) {
            console.error("Failed to fetch agents:", error);
        }
    };

    // --- UI Functions ---
    const renderAgentList = () => {
        const currentSelectedId = selectedAgentId;
        characterList.innerHTML = '';
        agents.forEach(agent => {
            const li = document.createElement('li');
            li.dataset.id = agent.id;
            li.innerHTML = `<span>${agent.name} <small>(${(agent.desc || 'No description')})</small></span>`;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${agent.name}?`)) {
                    await fetch(`/generator/api/agents/${agent.id}`, { method: 'DELETE' });
                    resetCharacterForm();
                    await fetchAgents();
                }
            };
            li.appendChild(deleteBtn);
            li.onclick = () => {
                document.querySelectorAll('#character-list li.selected').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
                selectedAgentId = agent.id;
                characterNameInput.value = agent.name;
                characterDescriptionInput.value = agent.canon;
                checkButtonStates();
            };
            characterList.appendChild(li);
        });
        if (currentSelectedId) {
            const liToSelect = document.querySelector(`#character-list li[data-id="${currentSelectedId}"]`);
            if(liToSelect) liToSelect.classList.add('selected');
        }
    };

    const resetCharacterForm = () => {
        characterNameInput.value = '';
        characterDescriptionInput.value = '';
        selectedAgentId = null;
        document.querySelectorAll('#character-list li.selected').forEach(el => el.classList.remove('selected'));
        generationProgress.style.display = 'none';
        checkButtonStates();
        characterNameInput.focus();
    };
    
    const setStatus = (message) => {
        statusMessage.textContent = message;
    };

    const checkButtonStates = (isLoading = false) => {
        const descNotEmpty = characterDescriptionInput.value.trim() !== '';
        const nameNotEmpty = characterNameInput.value.trim() !== '';
        const outlineNotEmpty = storyOutlineInput.value.trim() !== '';
        const worldDataNotEmpty = storyNameInput.value.trim() !== '' || outlineNotEmpty;

        createCharBtn.disabled = isLoading || !descNotEmpty || !nameNotEmpty;
        inventCharBtn.disabled = isLoading || !outlineNotEmpty;
        saveWorldBtn.disabled = isLoading || !worldDataNotEmpty;
        newCharBtn.disabled = isLoading;
    };

    // --- Event Listeners ---
    saveWorldBtn.addEventListener('click', async () => {
        setStatus('Saving world data...');
        checkButtonStates(true);
        try {
            await Promise.all([
                saveState('story_name', storyNameInput.value),
                saveState('story_outline', storyOutlineInput.value)
            ]);
            alert('World data saved!');
            setStatus('World data saved successfully.');
        } catch (error) {
            alert(`Error saving world data: ${error.message}`);
            setStatus(`Error saving world data: ${error.message}`);
        } finally {
            checkButtonStates(false);
        }
    });
    
    newCharBtn.addEventListener('click', () => {
        resetCharacterForm();
    });
    
    storyNameInput.addEventListener('input', () => checkButtonStates());
    storyOutlineInput.addEventListener('input', () => checkButtonStates());
    characterDescriptionInput.addEventListener('input', () => checkButtonStates());
    characterNameInput.addEventListener('input', () => checkButtonStates());

    createCharBtn.addEventListener('click', async () => {
        if (!modelSelect.value) {
            alert('Please select a model for generation.');
            return;
        }
        if (!characterNameInput.value.trim() || !characterDescriptionInput.value.trim()) {
            alert('Please provide a Character Name and Description.');
            return;
        }

        checkButtonStates(true);
        setStatus('Fleshing out new character...');
        generationProgress.style.display = 'block';
        progressList.querySelectorAll('li').forEach(li => li.classList.remove('completed'));

        const characterData = {
            name: characterNameInput.value.trim(),
            canon: characterDescriptionInput.value.trim()
        };

        const updateProgress = (id) => document.getElementById(id).classList.add('completed');
        updateProgress('progress-name');
        updateProgress('progress-canon');

        try {
            const modelId = modelSelect.value;
            let accumulatedStreamText = characterData.canon + '\n\n';

            const streamToUI = async (endpoint, body, field) => {
                const response = await fetch(`/generator${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!response.ok) throw new Error(`Failed at ${endpoint}`);
                let fullText = '';
                await readStream(response,
                    (textChunk) => {
                        characterDescriptionInput.value = accumulatedStreamText + `--- ${field.toUpperCase()} ---\n` + textChunk;
                        fullText = textChunk;
                    },
                    (finalText) => {
                        characterData[field] = finalText;
                        accumulatedStreamText += `--- ${field.toUpperCase()} ---\n` + finalText + '\n\n';
                    },
                    (err) => { throw err; }
                );
            };

            setStatus('Determining initial state...');
            await streamToUI('/api/invent/state', { characterName: characterData.name, characterCanon: characterData.canon, modelId }, 'state');
            updateProgress('progress-state');

            setStatus('Formulating initial goals...');
            await streamToUI('/api/invent/goals', { characterName: characterData.name, characterCanon: characterData.canon, modelId }, 'goals');
            updateProgress('progress-goals');

            characterDescriptionInput.value = characterData.canon;

            const generateSinglePrompt = async (promptType) => {
                setStatus(`Generating ${promptType}...`);
                const res = await fetch(`/generator/api/invent/${promptType}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ character: characterData, modelId })
                });
                if (!res.ok) throw new Error(`Failed to generate ${promptType}`);
                const { prompt } = await res.json();
                characterData[promptType] = prompt;
                updateProgress(`progress-${promptType}`);
            };

            await generateSinglePrompt('play_prompt');
            await generateSinglePrompt('awareness_prompt');
            await generateSinglePrompt('checker_prompt');
            await generateSinglePrompt('planner_prompt');

            characterData.desc = (characterData.canon || '').split('.')[0] + '.';

            setStatus('Saving new character to database...');
            const res = await fetch('/generator/api/agents/create-full', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(characterData)
            });
            if (!res.ok) throw new Error('Failed to save the final character');
            const finalAgent = await res.json();

            await fetchAgents();
            setTimeout(() => {
                const liToSelect = document.querySelector(`#character-list li[data-id="${finalAgent.id}"]`);
                if (liToSelect) liToSelect.click();
            }, 100);

            setStatus(`Successfully created ${finalAgent.name}!`);
        } catch (e) {
            setStatus(`Error during creation: ${e.message}`);
            characterDescriptionInput.value = characterData.canon;
        } finally {
            checkButtonStates(false);
            generationProgress.style.display = 'none';
        }
    });

    inventCharBtn.addEventListener('click', async () => {
        if (!storyOutlineInput.value.trim() || !modelSelect.value) {
            alert('Please provide a Story Outline and select a model.');
            return;
        }
        
        checkButtonStates(true);
        setStatus('Inventing new character...');
        resetCharacterForm();
        generationProgress.style.display = 'block';
        progressList.querySelectorAll('li').forEach(li => li.classList.remove('completed'));

        const characterData = {};

        try {
            const modelId = modelSelect.value;
            const storyOutline = storyOutlineInput.value;
            const updateProgress = (id) => document.getElementById(id).classList.add('completed');
            
            setStatus('Inventing name...');
            let res = await fetch('/generator/api/invent/name', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storyOutline, modelId })
            });
            if (!res.ok) throw new Error('Failed to generate name');
            const { name } = await res.json();
            characterData.name = name;
            characterNameInput.value = name;
            updateProgress('progress-name');
            
            let accumulatedStreamText = '';
            const streamToUI = async (endpoint, body, field) => {
                const response = await fetch(`/generator${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!response.ok) throw new Error(`Failed at ${endpoint}`);
                let fullText = '';
                await readStream(response, 
                    (textChunk) => {
                        characterDescriptionInput.value = accumulatedStreamText + textChunk;
                        fullText = textChunk;
                    },
                    (finalText) => {
                        characterData[field] = finalText;
                        accumulatedStreamText += finalText + '\n\n';
                    },
                    (err) => { throw err; }
                );
            };

            characterDescriptionInput.value = '';
            setStatus('Writing description...');
            await streamToUI('/api/invent/canon', { storyOutline, characterName: name, modelId }, 'canon');
            updateProgress('progress-canon');
            
            setStatus('Determining initial state...');
            accumulatedStreamText += '--- STATE ---\n';
            await streamToUI('/api/invent/state', { characterName: name, characterCanon: characterData.canon, modelId }, 'state');
            updateProgress('progress-state');

            setStatus('Formulating initial goals...');
            accumulatedStreamText += '--- GOALS ---\n';
            await streamToUI('/api/invent/goals', { characterName: name, characterCanon: characterData.canon, modelId }, 'goals');
            updateProgress('progress-goals');

            const generateSinglePrompt = async (promptType) => {
                setStatus(`Generating ${promptType}...`);
                res = await fetch(`/generator/api/invent/${promptType}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ character: characterData, modelId })
                });
                if (!res.ok) throw new Error(`Failed to generate ${promptType}`);
                const { prompt } = await res.json();
                characterData[promptType] = prompt;
                updateProgress(`progress-${promptType}`);
            };

            await generateSinglePrompt('play_prompt');
            await generateSinglePrompt('awareness_prompt');
            await generateSinglePrompt('checker_prompt');
            await generateSinglePrompt('planner_prompt');

            characterData.desc = (characterData.canon || '').split('.')[0] + '.';

            setStatus('Saving new character to database...');
            res = await fetch('/generator/api/agents/create-full', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(characterData)
            });
            if (!res.ok) throw new Error('Failed to save the final character');
            const finalAgent = await res.json();

            await fetchAgents();
            setTimeout(() => {
                const liToSelect = document.querySelector(`#character-list li[data-id="${finalAgent.id}"]`);
                if (liToSelect) liToSelect.click();
            }, 100);
            
            setStatus(`Successfully created ${finalAgent.name}!`);
        } catch (e) {
            setStatus(`Error during invention: ${e.message}`);
        } finally {
            checkButtonStates(false);
            generationProgress.style.display = 'none';
        }
    });

    // --- Collapsible Sections Logic ---
    const setupCollapsibleListener = (headerElement, contentElement, initialStateActive = false) => {
        if (!headerElement || !contentElement) return;

        const toggle = (isActive) => {
            if (isActive) {
                contentElement.style.maxHeight = 'none';
                const scrollHeight = contentElement.scrollHeight;
                contentElement.style.maxHeight = '0';
                contentElement.offsetHeight;
                contentElement.style.maxHeight = scrollHeight + 'px';
                contentElement.style.paddingTop = '15px';
                contentElement.style.paddingBottom = '15px';
                contentElement.classList.add('active');
                headerElement.classList.add('active');
                contentElement.addEventListener('transitionend', function handler() {
                    if (contentElement.classList.contains('active')) {
                        contentElement.style.maxHeight = 'none';
                    }
                    contentElement.removeEventListener('transitionend', handler);
                });
            } else {
                contentElement.style.maxHeight = '0';
                contentElement.style.paddingTop = '0';
                contentElement.style.paddingBottom = '0';
                contentElement.classList.remove('active');
                headerElement.classList.remove('active');
            }
        };

        toggle(initialStateActive);

        headerElement.addEventListener('click', function() {
            toggle(!this.classList.contains('active'));
        });
    };

    // --- Initialization ---
    const initializeModels = async () => {
        const modelSection = document.getElementById('model-section');
        let preferredModelFound = false;
        try {
            const res = await fetch('/generator/api/models');
            
            if (!res.ok) {
                if (res.status === 503) {
                    const errorData = await res.json();
                    alert("Model files not found - please check .env file or select LM Studio option in settings");
                    window.location.href = '/settings';
                    return;
                }
                throw new Error(`Server responded with status ${res.status}`);
            }

            const data = await res.json();
            
            if (data.isLmStudio === false) {
                if(modelSection) modelSection.style.display = 'none';
            }

            const { availableModels, preferredModel } = data;
            if (!availableModels || availableModels.length === 0) {
                modelStatusText.textContent = 'Error: No models found from LM Studio. Please load a model.';
                modelPickerGroup.style.display = 'none';
            } else {
                const found = preferredModel ? availableModels.find(m => m.id === preferredModel) : null;
                if (found) {
                    modelStatusText.textContent = `Using preferred model: ${preferredModel}`;
                    modelPickerGroup.style.display = 'none';
                    modelSelect.innerHTML = `<option value="${preferredModel}">${preferredModel}</option>`;
                    modelSelect.value = preferredModel;
                    preferredModelFound = true;
                } else {
                    modelStatusText.textContent = preferredModel ? `Preferred model from .env not found. Please select an available model:` : 'Please select a model:';
                    modelPickerGroup.style.display = 'block';
                    modelSelect.innerHTML = '<option value="">Select a Model</option>';
                    availableModels.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.id;
                        option.textContent = model.id;
                        modelSelect.appendChild(option);
                    });
                    if (modelSelect.options.length > 1) modelSelect.selectedIndex = 1;
                }
            }
        } catch (e) {
            console.error("Could not load models:", e);
            modelStatusText.textContent = `Error: Could not connect to server or LM Studio.`;
            modelPickerGroup.style.display = 'none';
        } finally {
            setupCollapsibleListener(modelConfigHeader, modelConfigContent, !preferredModelFound);
        }
    };
    
    const init = async () => {
        await initializeModels();
        storyNameInput.value = await getState('story_name') || '';
        storyOutlineInput.value = await getState('story_outline') || '';
        await fetchAgents();
        resetCharacterForm();
        checkButtonStates();
        setupCollapsibleListener(worldDataHeader, worldDataContent, true);
    };

    init();
});
