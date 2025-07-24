document.addEventListener('DOMContentLoaded', () => {
    const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
    const agentSelect = document.getElementById('agent-select');
    const exportCharacterBtn = document.getElementById('export-character-btn');
    const importCharacterBtn = document.getElementById('import-character-btn');
    const statusMessage = document.getElementById('status-message');
    const useLmStudioCheckbox = document.getElementById('use-lm-studio-checkbox'); // NEW

    // Custom Modal Elements
    const customModal = document.getElementById('custom-modal');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    let modalResolve;
    let allAgents = [];

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

    const setButtonsDisabled = (disabled) => {
        resetDefaultsBtn.disabled = disabled;
        exportCharacterBtn.disabled = disabled;
        importCharacterBtn.disabled = disabled;
        agentSelect.disabled = disabled;
        useLmStudioCheckbox.disabled = disabled; // NEW
    };

    const fetchAgents = async () => {
        agentSelect.innerHTML = '<option value="">Select AI Person to export</option>';
        try {
            const response = await fetch('/settings/api/agents');
            if (!response.ok) throw new Error('Failed to fetch agents.');
            allAgents = await response.json();
            
            agentSelect.innerHTML = '<option value="">Select AI Person to export</option>';
            if (allAgents.length > 0) {
                allAgents.forEach(agent => {
                    const option = document.createElement('option');
                    option.value = agent.id;
                    option.textContent = `${agent.name} (${agent.type})`;
                    agentSelect.appendChild(option);
                });
            } else {
                agentSelect.innerHTML = '<option value="">No agents found.</option>';
            }
        } catch (error) {
            console.error('Error fetching agents:', error);
            statusMessage.textContent = `Error loading agents: ${error.message}`;
            statusMessage.style.color = 'red';
            agentSelect.innerHTML = '<option value="">Error loading agents</option>';
        }
    };

    // --- NEW: Fetch and set model settings ---
    const fetchModelSettings = async () => {
        try {
            const response = await fetch('/settings/api/model-settings');
            if (!response.ok) {
                // If not found, it's the first run, so we default to false (unchecked)
                if (response.status === 404) {
                    useLmStudioCheckbox.checked = false;
                    return;
                }
                throw new Error('Failed to fetch model settings.');
            }
            const settings = await response.json();
            // The value is stored as a string 'true' or 'false'
            useLmStudioCheckbox.checked = settings.value === 'true';
        } catch (error) {
            console.error('Error fetching model settings:', error);
            statusMessage.textContent = `Error loading model settings: ${error.message}`;
            statusMessage.style.color = 'red';
        }
    };

    // --- Event Listeners ---

    resetDefaultsBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal('WARNING: This will reset ALL application prompts and state variables to their default values. This action cannot be undone. Are you sure?');
        
        if (!confirmed) {
            statusMessage.textContent = 'Reset cancelled.';
            statusMessage.style.color = 'orange';
            return;
        }

        statusMessage.textContent = 'Resetting app defaults...';
        statusMessage.style.color = '';
        setButtonsDisabled(true);

        try {
            const response = await fetch('/settings/api/reset-defaults', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (response.ok) {
                statusMessage.textContent = result.message;
                statusMessage.style.color = 'green';
                await fetchAgents();
                await fetchModelSettings(); // Re-fetch settings after reset
            } else {
                statusMessage.textContent = `Error: ${result.error || 'Unknown error'}`;
                statusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error resetting defaults:', error);
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = 'red';
        } finally {
            setButtonsDisabled(false);
        }
    });

    exportCharacterBtn.addEventListener('click', async () => {
        const agentId = agentSelect.value;
        if (!agentId) {
            alert('Please select an agent to export.');
            return;
        }

        const selectedAgent = allAgents.find(agent => agent.id == agentId);
        if (!selectedAgent) {
            alert('Selected agent not found in list.');
            return;
        }

        const confirmed = await showConfirmModal(`Exporting agent "${selectedAgent.name}". Continue?`);
        if (!confirmed) {
            statusMessage.textContent = 'Export cancelled.';
            statusMessage.style.color = 'orange';
            return;
        }

        statusMessage.textContent = `Exporting "${selectedAgent.name}"...`;
        statusMessage.style.color = '';
        setButtonsDisabled(true);

        try {
            const response = await fetch(`/settings/api/export-agent/${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch agent data for export.');
            const agentData = await response.json();

            const agentJsonString = JSON.stringify(agentData, null, 2);

            const zip = new JSZip();
            zip.file(`${selectedAgent.name}.json`, agentJsonString);

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${selectedAgent.name}.scil`);

            statusMessage.textContent = `Agent "${selectedAgent.name}" exported successfully!`;
            statusMessage.style.color = 'green';

        } catch (error) {
            console.error('Error exporting character:', error);
            statusMessage.textContent = `Error exporting character: ${error.message}`;
            statusMessage.style.color = 'red';
        } finally {
            setButtonsDisabled(false);
        }
    });

    importCharacterBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal('Importing a character will add a new agent to your database. If an agent with the same name exists, it will create a duplicate. Continue?');
        if (!confirmed) {
            statusMessage.textContent = 'Import cancelled.';
            statusMessage.style.color = 'orange';
            return;
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.scil';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) {
                statusMessage.textContent = 'No file selected.';
                statusMessage.style.color = 'orange';
                setButtonsDisabled(false);
                document.body.removeChild(fileInput);
                return;
            }

            if (!file.name.endsWith('.scil')) {
                alert('Please select a .scil file.');
                statusMessage.textContent = 'Invalid file type. Please select a .scil file.';
                statusMessage.style.color = 'red';
                setButtonsDisabled(false);
                document.body.removeChild(fileInput);
                return;
            }

            statusMessage.textContent = `Importing "${file.name}"...`;
            statusMessage.style.color = '';
            setButtonsDisabled(true);

            try {
                const zip = await JSZip.loadAsync(file);
                let agentJsonFile = null;

                zip.forEach((relativePath, zipEntry) => {
                    if (relativePath.endsWith('.json')) {
                        agentJsonFile = zipEntry;
                    }
                });

                if (!agentJsonFile) {
                    throw new Error('No .json file found inside the .scil archive.');
                }

                const agentJsonString = await agentJsonFile.async('text');
                const agentData = JSON.parse(agentJsonString);

                if (!agentData.name || agentData.name.trim() === '' ||
                    !agentData.type || agentData.type.trim() === '') {
                    throw new Error('Invalid agent data: Missing or empty name or type.');
                }

                const response = await fetch('/settings/api/import-agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(agentData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to import agent on server.');
                }

                const result = await response.json();
                statusMessage.textContent = `Agent "${agentData.name}" imported successfully! (ID: ${result.id})`;
                statusMessage.style.color = 'green';
                await fetchAgents();

            } catch (error) {
                console.error('Error importing character:', error);
                statusMessage.textContent = `Error importing character: ${error.message}`;
                statusMessage.style.color = 'red';
            } finally {
                setButtonsDisabled(false);
                document.body.removeChild(fileInput);
            }
        });

        fileInput.click();
        setButtonsDisabled(true);
    });

    // --- NEW: Event listener for the model setting checkbox ---
    useLmStudioCheckbox.addEventListener('change', async (event) => {
        const useLmStudio = event.target.checked;
        statusMessage.textContent = 'Saving model setting...';
        statusMessage.style.color = '';
        setButtonsDisabled(true);

        try {
            const response = await fetch('/settings/api/model-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ useLmStudio: useLmStudio.toString() }) // Send as string
            });

            if (!response.ok) {
                throw new Error('Failed to save model setting.');
            }
            
            const result = await response.json();
            statusMessage.textContent = result.message;
            statusMessage.style.color = 'green';

        } catch (error) {
            console.error('Error saving model setting:', error);
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = 'red';
            // Revert checkbox on error
            event.target.checked = !useLmStudio;
        } finally {
            setButtonsDisabled(false);
        }
    });


    // Initial fetch of data when the page loads
    fetchAgents();
    fetchModelSettings(); // NEW
});