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
 * @param {string} message 
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
  paragraph.textContent = note.body || '';

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
 * Reusable fetch wrapper that checks response.ok and returns data along with HTTP status.
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<{ data: any, status: number }>}
 */
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
  }

  const data = response.status === 204 ? null : await response.json();
  return { data, status: response.status };
}

/**
 * GET: Loads 10 notes from the server.
 */
async function loadNotes() {
  setStatus('loading', 'Loading notes...');
  setButtonsDisabled(true);

  try {
    const { data: notes } = await request(`${API_URL}?_limit=10`, { method: 'GET' });

    notesList.textContent = '';

    if (!Array.isArray(notes) || notes.length === 0) {
      renderEmptyState('No notes found on the server.');
      setStatus('success', 'Loaded 0 notes from the server.');
      return;
    }

    notes.forEach(note => {
      notesList.appendChild(createNoteElement(note));
    });

    setStatus('success', `Loaded ${notes.length} notes from the server.`);
  } catch (error) {
    setStatus('error', 'Failed to load notes. Please check your connection and try again.');
  } finally {
    setButtonsDisabled(false);
  }
}

/**
 * POST: Validates input, creates a note, prepends it, and reports status code and new ID.
 * @param {SubmitEvent} event 
 */
async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  // Validation: Required and max 100 characters (body is optional)
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
  submitBtn.disabled = true;

  try {
    const payload = { title, body, userId: 1 };
    const { data: createdNote, status } = await request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    // Remove empty state message if present
    const emptyPlaceholder = notesList.querySelector('.empty-state');
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    // Prepend new note to the top of the list
    const noteElement = createNoteElement(createdNote);
    notesList.prepend(noteElement);

    // Reset the form fields and show formatted success text
    noteForm.reset();
    setStatus('success', `Note created (status ${status}, id ${createdNote.id}).`);
  } catch (error) {
    setStatus('error', 'Failed to create note. Please try again.');
  } finally {
    submitBtn.disabled = false;
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
