// Constant API endpoint
const API_URL = 'https://jsonplaceholder.typicode.com/posts';

// DOM element references
const loadBtn = document.getElementById('load-btn');
const statusElem = document.getElementById('status');
const noteForm = document.getElementById('note-form');
const titleInput = document.getElementById('title-input');
const bodyInput = document.getElementById('body-input');
const submitBtn = document.getElementById('submit-btn');
const notesList = document.getElementById('notes-list');

/**
 * Updates UI status message and styling.
 * @param {'loading'|'success'|'error'|'clear'} type 
 * @param {string} [message=''] 
 */
function setStatus(type, message = '') {
  statusElem.className = '';

  if (type === 'clear' || !message) {
    statusElem.textContent = '';
    return;
  }

  statusElem.textContent = message;
  statusElem.classList.add('active', type);
}

/**
 * Toggles disabled state of all actionable buttons.
 * @param {boolean} disabled 
 */
function setButtonsDisabled(disabled) {
  loadBtn.disabled = disabled;
  submitBtn.disabled = disabled;
  const deleteBtns = notesList.querySelectorAll('.delete-btn');
  deleteBtns.forEach(btn => {
    btn.disabled = disabled;
  });
}

/**
 * Renders an empty-state message inside the list.
 */
function renderEmptyState(message = 'No notes available.') {
  notesList.textContent = '';
  const emptyItem = document.createElement('li');
  emptyItem.className = 'empty-state';
  emptyItem.textContent = message;
  notesList.appendChild(emptyItem);
}

/**
 * Builds and returns a note list item element safely using textContent.
 * @param {{ id: number|string, title: string, body: string }} note 
 * @returns {HTMLLIElement}
 */
function createNoteElement(note) {
  const li = document.createElement('li');
  li.className = 'note-item';
  li.dataset.id = note.id;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'note-content';

  const heading = document.createElement('h3');
  heading.className = 'note-title';
  heading.textContent = note.title;

  const paragraph = document.createElement('p');
  paragraph.className = 'note-body';
  paragraph.textContent = note.body;

  contentDiv.appendChild(heading);
  contentDiv.appendChild(paragraph);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteNote(note.id, li));

  li.appendChild(contentDiv);
  li.appendChild(deleteBtn);

  return li;
}

/**
 * Reusable fetch wrapper with error handling and response validation.
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<any>}
 */
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
  }

  // Handle 204 No Content or empty responses
  if (response.status === 204) {
    return null;
  }

  return await response.json();
}

/**
 * GET: Loads 10 notes from the server.
 */
async function loadNotes() {
  setStatus('loading', 'Loading notes...');
  setButtonsDisabled(true);

  try {
    const notes = await request(`${API_URL}?_limit=10`, { method: 'GET' });

    notesList.textContent = '';

    if (!Array.isArray(notes) || notes.length === 0) {
      renderEmptyState('No notes found on the server.');
      setStatus('success', 'Loaded 0 notes from the server.');
      return;
    }

    notes.forEach(note => {
      const noteElement = createNoteElement(note);
      notesList.appendChild(noteElement);
    });

    setStatus('success', `Loaded ${notes.length} notes from the server.`);
  } catch (error) {
    setStatus('error', 'Failed to load notes. Please check your connection and try again.');
  } finally {
    setButtonsDisabled(false);
  }
}

/**
 * POST: Validates input and creates a new note.
 */
async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  // Validation: Required and max 100 characters
  if (!title) {
    setStatus('error', 'Validation error: Title is required.');
    titleInput.focus();
    return;
  }

  if (title.length > 100) {
    setStatus('error', 'Validation error: Title cannot exceed 100 characters.');
    titleInput.focus();
    return;
  }

  setStatus('loading', 'Creating note...');
  setButtonsDisabled(true);

  try {
    const payload = { title, body, userId: 1 };
    const createdNote = await request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    // Remove empty-state placeholder if present
    const emptyPlaceholder = notesList.querySelector('.empty-state');
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    // Insert new note at the top of the list
    const noteElement = createNoteElement(createdNote);
    notesList.prepend(noteElement);

    // Reset form inputs
    noteForm.reset();
    setStatus('success', `Note "${createdNote.title}" created successfully.`);
  } catch (error) {
    setStatus('error', 'Failed to create note. Please try again.');
  } finally {
    setButtonsDisabled(false);
  }
}

/**
 * DELETE: Deletes an individual note by ID.
 * @param {number|string} id 
 * @param {HTMLLIElement} noteElement 
 */
async function deleteNote(id, noteElement) {
  setStatus('loading', 'Deleting note...');
  setButtonsDisabled(true);

  try {
    await request(`${API_URL}/${id}`, { method: 'DELETE' });

    noteElement.remove();

    // Check if the list became empty after removal
    if (notesList.children.length === 0) {
      renderEmptyState('No notes remaining.');
    }

    setStatus('success', 'Note deleted successfully.');
  } catch (error) {
    setStatus('error', 'Failed to delete note. Please try again.');
  } finally {
    setButtonsDisabled(false);
  }
}

// Initial empty state on page load
renderEmptyState('Click "Load notes" to fetch data from the server.');

// Event Listeners
loadBtn.addEventListener('click', loadNotes);
noteForm.addEventListener('submit', createNote);