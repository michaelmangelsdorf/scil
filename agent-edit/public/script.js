const API_BASE_PATH = '/agent-editor/api';

let allAgents = [];
let selectedAgentId = null;
let saveInProgress = false; // Add this line for the bug fix

// --- DOM Element References ---
const agentForm = document.getElementById('agentForm');
const agentIdInput = document.getElementById('agentId');
const agentNameInput = document.getElementById('agentName');
const agentTypeInput = document.getElementById('agentType');
const agentDescInput = document.getElementById('agentDesc');

// NEW/MOVED: References for prompt fields
const agentCanonInput = document.getElementById('agentCanon');
const agentPlayPromptInput = document.getElementById('agentPlayPrompt');
const agentForwardPromptInput = document.getElementById('agentForwardPrompt');
const agentCheckerPromptInput = document.getElementById('agentCheckerPrompt');
const agentAwarenessPromptInput = document.getElementById('agentAwarenessPrompt');
const agentPlannerPromptInput = document.getElementById('agentPlannerPrompt');
const agentGoalsInput = document.getElementById('agentGoals');
const agentStateInput = document.getElementById('agentState');

const saveAgentBtn = document.getElementById('saveAgentBtn'); // MOVED
const deleteAgentBtn = document.getElementById('deleteAgentBtn'); // MOVED
const newAgentBtn = document.getElementById('newAgentBtn');
const clearAgentsBtn = document.getElementById('clearAgentsBtn'); // MOVED
const agentList = document.getElementById('agentList');
const typeFilter = document.getElementById('typeFilter');
const noAgentSelectedDiv = document.getElementById('noAgentSelected');
const detailsHeader = document.getElementById('detailsHeader');

// Removed old accordion header/content references as they are replaced by multiple new ones.

// --- Field Descriptions ---
const fieldDescriptions = {
    agentCanon: {
        short: "The canon field of your character should grow in time. This field is basically a save-haven that the AI will not touch. But it will inform the AI about the character. As your story progresses, copy and paste interesting facts about your character in here manually.",
    },
    agentPlayPrompt: {
        short: "This prompt gets run when you press Play, or Auto. It is the core of the 'system prompt' for your character. It should take the form of an imperative: Impersonate (name), be like this or like that, etc.",
    },
    agentForwardPrompt: {
        short: "This is the prompt that gets run when you press 'Evolve'. It gets a lot of history about your character as input, including their status and past dialogs, and including the current play prompt, and then completely overwrites the Play prompt, so this is difficult to get just right and you need to take care.",
    },
    agentCheckerPrompt: {
        short: "This prompt gets run when 'Refine' is checked. It receives ONLY the output of your Play prompt as input. It's optional, for example if you want to enforce that your character speaks a certain way.",
    },
    agentState: {
        short: "Put a freeform description of the current state of you character here. The Awareness prompt takes this field as input, and overwrites it with its response.",
    },
    agentAwarenessPrompt: {
        short: "This prompt gets run when you press the Think button. It gets the State field as input, and writes a completely new state from the previous one.",
    },
    agentGoals: {
        short: "Put a freeform description of the current goals of your character here. The Planner prompt takes this field as input, and overwrites it with its response.",
    },
    agentPlannerPrompt: {
        short: "This prompt gets run when you press the Plan button. It takes the goals of your character, and writes a completely new goals descirption from the previous goals field.",
    }
};

function setFieldDescription(fieldName, descriptionText) {
    const descriptionElement = document.getElementById(`${fieldName}Description`);
    if (descriptionElement) {
        descriptionElement.textContent = descriptionText;
    }
}

// Function to manage button states
function setInteractionState(isSaving) {
    saveInProgress = isSaving;
    saveAgentBtn.disabled = isSaving;
    newAgentBtn.disabled = isSaving;
    clearAgentsBtn.disabled = isSaving;
    // Delete button visibility depends on selectedAgentId, not just save state
    if (selectedAgentId && !isSaving) { // Only enable if an agent is selected and not saving
        deleteAgentBtn.disabled = false;
        deleteAgentBtn.style.display = 'inline-block';
    } else {
        deleteAgentBtn.disabled = true;
        deleteAgentBtn.style.display = 'none'; // Ensure hidden if no agent or saving
    }
}

// --- Utility Functions ---

function showAgentDetails(show) {
    agentForm.style.display = show ? 'block' : 'none';
    noAgentSelectedDiv.style.display = show ? 'none' : 'block';
    // Show/hide the global action buttons and prompting section only if an agent is selected/being edited
    document.querySelector('.global-action-buttons-group').style.display = show ? 'flex' : 'none';
    document.querySelector('.prompting-section').style.display = show ? 'block' : 'none';

    // When showing, set correct state for delete button
    if (show) {
        if (selectedAgentId) {
            deleteAgentBtn.style.display = 'inline-block';
            deleteAgentBtn.disabled = false;
        } else {
            deleteAgentBtn.style.display = 'none';
            deleteAgentBtn.disabled = true;
        }
    } else { // If hiding details, hide and disable delete
        deleteAgentBtn.style.display = 'none';
        deleteAgentBtn.disabled = true;
    }
}

function resetForm() {
    selectedAgentId = null;
    agentIdInput.value = '';
    agentNameInput.value = '';
    agentTypeInput.value = 'Person';
    agentDescInput.value = 'Roleplay Partner';
    
    // Reset new field locations
    agentCanonInput.value = '';
    agentPlayPromptInput.value = '';
    agentForwardPromptInput.value = '';
    agentCheckerPromptInput.value = '';
    agentAwarenessPromptInput.value = '';
    agentPlannerPromptInput.value = '';
    agentGoalsInput.value = '';
    agentStateInput.value = '';

    // Clear descriptions
    for (const key in fieldDescriptions) {
        setFieldDescription(key, '');
    }

    saveAgentBtn.textContent = 'Save New Agent';
    detailsHeader.textContent = 'New Agent';
    const currentSelected = document.querySelector('#agentList li.selected');
    if (currentSelected) currentSelected.classList.remove('selected');
    showAgentDetails(true); // Always show details for a new agent
    initializeCollapsibles(); // Re-initialize collapsibles to ensure they are all closed
    setInteractionState(false); // Reset to interactive state for new agent
    deleteAgentBtn.style.display = 'none'; // Ensure delete button is hidden for new agents
    deleteAgentBtn.disabled = true; // Ensure delete button is disabled for new agents
}

// --- UPDATED populateForm function ---
async function populateForm(agent) {
    selectedAgentId = agent.id;
    agentIdInput.value = agent.id;
    agentNameInput.value = agent.name;
    agentTypeInput.value = agent.type;
    agentDescInput.value = agent.desc;

    // Populate fields from their new locations
    agentCanonInput.value = agent.canon || '';
    agentPlayPromptInput.value = agent.play_prompt || '';
    agentForwardPromptInput.value = agent.forward_prompt || '';
    agentCheckerPromptInput.value = agent.checker_prompt || '';
    agentGoalsInput.value = agent.goals || '';
    agentStateInput.value = agent.state || '';

    // Populate short descriptions
    setFieldDescription('agentCanon', fieldDescriptions.agentCanon.short);
    setFieldDescription('agentPlayPrompt', fieldDescriptions.agentPlayPrompt.short);
    setFieldDescription('agentForwardPrompt', fieldDescriptions.agentForwardPrompt.short);
    setFieldDescription('agentCheckerPrompt', fieldDescriptions.agentCheckerPrompt.short);
    setFieldDescription('agentState', fieldDescriptions.agentState.short);
    setFieldDescription('agentGoals', fieldDescriptions.agentGoals.short);

    // --- NEW LOGIC: Populate prompts with defaults if they are empty ---
    try {
        // Awareness Prompt
        if (agent.awareness_prompt && agent.awareness_prompt.trim() !== '') {
            agentAwarenessPromptInput.value = agent.awareness_prompt;
            setFieldDescription('agentAwarenessPrompt', fieldDescriptions.agentAwarenessPrompt.short);
        } else {
            const res = await fetch(`${API_BASE_PATH}/state/agent-prompts/default_awareness_prompt`);
            if (res.ok) {
                const data = await res.json();
                agentAwarenessPromptInput.value = data.value;
                setFieldDescription('agentAwarenessPrompt', fieldDescriptions.agentAwarenessPrompt.short);
            } else {
                console.warn('Could not fetch default awareness prompt.');
                setFieldDescription('agentAwarenessPrompt', ''); // Clear if not found
            }
        }
        // Planner Prompt
        if (agent.planner_prompt && agent.planner_prompt.trim() !== '') {
            agentPlannerPromptInput.value = agent.planner_prompt;
            setFieldDescription('agentPlannerPrompt', fieldDescriptions.agentPlannerPrompt.short);
        } else {
            const res = await fetch(`${API_BASE_PATH}/state/agent-prompts/default_planner_prompt`);
            if (res.ok) {
                const data = await res.json();
                agentPlannerPromptInput.value = data.value;
                setFieldDescription('agentPlannerPrompt', fieldDescriptions.agentPlannerPrompt.short);
            } else {
                console.warn('Could not fetch default planner prompt.');
                setFieldDescription('agentPlannerPrompt', ''); // Clear if not found
            }
        }
    } catch (error) {
        console.error("Could not fetch default prompts:", error);
        // Leave fields blank on error
        setFieldDescription('agentAwarenessPrompt', '');
        setFieldDescription('agentPlannerPrompt', '');
    }

    saveAgentBtn.textContent = 'Update Agent';
    detailsHeader.textContent = `Editing: ${agent.name}`;
    showAgentDetails(true);
    initializeCollapsibles(); // Re-initialize collapsibles to ensure they are all closed
    setInteractionState(false); // Enable buttons for editing an existing agent
}

function selectAgent(id) {
    const agent = allAgents.find(a => a.id === id);
    if (agent) {
        document.querySelectorAll('#agentList li').forEach(item => item.classList.remove('selected'));
        const listItem = document.querySelector(`#agentList li[data-id="${id}"]`);
        if (listItem) listItem.classList.add('selected');
        populateForm(agent); // populateForm is now async
    }
}

async function fetchAgents(type = '') {
    try {
        const url = type ? `${API_BASE_PATH}/agents?type=${encodeURIComponent(type)}` : `${API_BASE_PATH}/agents`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const agents = await response.json();
        allAgents = agents;
        renderAgentList(agents);
        populateTypeFilter(agents);
    } catch (error) {
        console.error('Error fetching agents:', error);
        alert('Failed to load agents.');
    }
}

function renderAgentList(agentsToRender) {
    agentList.innerHTML = '';
    if (agentsToRender.length === 0) {
        agentList.innerHTML = '<li>No agents found.</li>';
        return;
    }
    agentsToRender.forEach(agent => {
        const li = document.createElement('li');
        li.dataset.id = agent.id;
        li.textContent = `${agent.name} (${agent.type || 'N/A'})`;
        li.addEventListener('click', () => selectAgent(agent.id));
        agentList.appendChild(li);
    });
    if (selectedAgentId) {
        const currentSelected = document.querySelector(`#agentList li[data-id="${selectedAgentId}"]`);
        if (currentSelected) currentSelected.classList.add('selected');
    }
}

function populateTypeFilter(agents) {
    const types = [...new Set(agents.map(agent => agent.type).filter(Boolean))];
    const currentFilter = typeFilter.value;
    typeFilter.innerHTML = '<option value="">All</option>';
    types.sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
    });
    typeFilter.value = currentFilter;
}

// --- NEW: Generic Collapsible Functionality (modified for scrolling and dynamic padding) ---
const initializeCollapsibles = () => {
    document.querySelectorAll('.accordion-header').forEach(header => {
        const content = header.nextElementSibling;
        // Ensure all are initially collapsed
        content.style.maxHeight = '0';
        content.style.paddingTop = '0';
        content.style.paddingBottom = '0';
        header.classList.remove('active');
        content.classList.remove('active');

        header.onclick = function() {
            // Reference to the global button group
            const buttonRow = document.querySelector('.global-action-buttons-group');

            if (content.style.maxHeight !== "0px" && content.style.maxHeight !== "") { // If it was active, now collapsing
                content.style.maxHeight = '0';
                content.style.paddingTop = '0';
                content.style.paddingBottom = '0';
                content.classList.remove('active');
                this.classList.remove('active');
                
                // When collapsing, remove the dynamic bottom padding after a slight delay
                // to allow the collapse transition to start.
                setTimeout(() => {
                    document.body.style.paddingBottom = ''; // Remove the padding
                }, 300); // Match or slightly exceed CSS transition time
                
            } else { // Expand it
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

                // Add dynamic bottom padding to ensure scrollable space
                // Use a value significantly larger than the viewport height.
                document.body.style.paddingBottom = '100vh'; // Add one full viewport height of padding

                // Scroll to the button row after expansion starts and padding is added
                if (buttonRow) {
                    setTimeout(() => {
                        buttonRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100); // Adjust timeout as needed
                }

                // After transition, set maxHeight to 'none' to allow content to grow/shrink naturally
                // if window resizes or content changes
                content.addEventListener('transitionend', function handler() {
                    if (content.classList.contains('active')) {
                        content.style.maxHeight = 'none';
                    }
                    content.removeEventListener('transitionend', handler);
                }, { once: true });
            }
        };
    });
};


// --- Event Listeners ---

newAgentBtn.addEventListener('click', () => {
    resetForm();
    // populateForm({}); // No need to call this, resetForm handles initial defaults
    agentNameInput.focus();
});

// MODIFIED: saveAgentBtn now handles checking for existing agent by name
saveAgentBtn.addEventListener('click', async (event) => {
    event.preventDefault(); // Prevent default form submission if this button was inside a form

    if (saveInProgress) { // Prevent multiple clicks while save is in progress
        console.warn('Save already in progress, please wait.');
        return;
    }

    setInteractionState(true); // Disable buttons during save operation

    const agentData = {
        id: selectedAgentId, // Include ID for updates (will be null for new agents initially)
        name: agentNameInput.value.trim(),
        desc: agentDescInput.value.trim(),
        type: agentTypeInput.value.trim(),
        
        // Get values from new locations
        canon: agentCanonInput.value.trim(),
        play_prompt: agentPlayPromptInput.value.trim(),
        forward_prompt: agentForwardPromptInput.value.trim(),
        checker_prompt: agentCheckerPromptInput.value.trim(),
        awareness_prompt: agentAwarenessPromptInput.value.trim(),
        planner_prompt: agentPlannerPromptInput.value.trim(),
        goals: agentGoalsInput.value.trim(),
        state: agentStateInput.value.trim()
    };

    if (!agentData.name) {
        alert('Agent name cannot be empty.');
        setInteractionState(false); // Re-enable buttons on validation failure
        return;
    }

    let url;
    let method;
    let agentToUpdate = null; // To store the existing agent if found by name

    if (selectedAgentId) {
        // If an agent is already selected, it's always an update
        url = `${API_BASE_PATH}/agents/${selectedAgentId}`;
        method = 'PUT';
    } else {
        // No agent selected, so it's potentially a new agent or an update by name
        // Check if an agent with this name already exists in the local allAgents array
        agentToUpdate = allAgents.find(agent => agent.name.toLowerCase() === agentData.name.toLowerCase());

        if (agentToUpdate) {
            // An agent with this name exists, so switch to update mode
            selectedAgentId = agentToUpdate.id; // Set selectedId to the existing one's ID
            url = `${API_BASE_PATH}/agents/${selectedAgentId}`;
            method = 'PUT';
            alert(`An agent named "${agentData.name}" already exists. Updating it instead of creating a new one.`);
        } else {
            // No agent with this name exists, proceed with creating a new one
            url = `${API_BASE_PATH}/agents`;
            method = 'POST';
        }
    }

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentData)
        });
        if (!response.ok) throw new Error((await response.json()).error || response.statusText);
        
        const responseData = await response.json();
        alert('Agent saved successfully!');
        
        if (method === 'POST') { // Only update selectedAgentId if a new one was actually created
            selectedAgentId = responseData.id;
        }
        await fetchAgents(typeFilter.value);
        selectAgent(selectedAgentId);
    } catch (error) {
        alert(`Failed to save agent: ${error.message}`);
    } finally {
        setInteractionState(false); // Always re-enable buttons after operation
    }
});

deleteAgentBtn.addEventListener('click', async () => {
    if (!selectedAgentId || !confirm('Are you sure you want to delete this agent?')) return;
    setInteractionState(true); // Disable during delete
    try {
        const response = await fetch(`${API_BASE_PATH}/agents/${selectedAgentId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error((await response.json()).error || response.statusText);
        alert('Agent deleted successfully!');
        selectedAgentId = null;
        await fetchAgents(typeFilter.value);
        resetForm();
        showAgentDetails(false); // This will set delete button state correctly
    } catch (error) {
        alert(`Failed to delete agent: ${error.message}`);
    } finally {
        setInteractionState(false); // Re-enable after delete
        // If no agent selected after delete, ensure delete button remains hidden/disabled
        if (selectedAgentId === null) {
            deleteAgentBtn.style.display = 'none';
            deleteAgentBtn.disabled = true;
        }
    }
});

typeFilter.addEventListener('change', () => fetchAgents(typeFilter.value));

clearAgentsBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to CLEAR ALL AGENTS? This cannot be undone.')) return;
    setInteractionState(true); // Disable during clear
    try {
        const response = await fetch(`${API_BASE_PATH}/clear-agents-table`, { method: 'POST' });
        if (!response.ok) throw new Error((await response.json()).error || response.statusText);
        alert('All agents cleared successfully!');
        selectedAgentId = null;
        await fetchAgents();
        resetForm();
        showAgentDetails(false); // This will set delete button state correctly
    } catch (error) {
        alert(`Failed to clear agents: ${error.message}`);
    } finally {
        setInteractionState(false); // Re-enable after clear
        // After clearing all, ensure delete button is hidden/disabled
        deleteAgentBtn.style.display = 'none';
        deleteAgentBtn.disabled = true;
    }
});

// --- NEW: Scroll to top on most button clicks (modified to remove padding) ---
document.body.addEventListener('click', (event) => {
    // Check if the clicked element is a button
    if (event.target.tagName === 'BUTTON') {
        // Exclude collapsible headers from triggering scroll to top
        if (!event.target.classList.contains('accordion-header')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // When scrolling to top via a button, remove the dynamic bottom padding
            document.body.style.paddingBottom = '';
        }
    }
});

// Add event listeners for the help icons
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.help-icon').forEach(icon => {
        icon.addEventListener('click', (event) => {
            const fieldName = event.target.dataset.fieldName;
            if (fieldName && fieldDescriptions[fieldName]) {
                alert(fieldDescriptions[fieldName].full);
            }
        });
    });
});


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    fetchAgents();
    showAgentDetails(false); // Hide details until an agent is selected or created
    initializeCollapsibles(); // Initialize collapsibles on page load
    setInteractionState(false); // Ensure buttons are interactive on initial load, but delete hidden
    deleteAgentBtn.style.display = 'none'; // Explicitly hide delete on initial load
    deleteAgentBtn.disabled = true; // Disable delete on initial load
});