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
 * Toggles disabled state of all actionable buttons to prevent race conditions.
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

  // Delete button wired to send DELETE /posts/{id}
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
 * Reusable fetch wrapper that checks response.ok and returns parsed data + status code.
 * Safely handles empty response bodies (such as HTTP 204 or empty DELETE responses).
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<{ data: any, status: number }>}
 */
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
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
    const { data: createdNote, status } = await request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    // Remove empty-state message if present
    const emptyPlaceholder = notesList.querySelector('.empty-state');
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    // Prepend created note to top of the list
    const noteElement = createNoteElement(createdNote);
    notesList.prepend(noteElement);

    noteForm.reset();
    setStatus('success', `Note created (status ${status}, id ${createdNote.id}).`);
  } catch (error) {
    setStatus('error', 'Failed to create note. Please try again.');
  } finally {
    setButtonsDisabled(false);
  }
}

/**
 * DELETE: Sends DELETE /posts/{id} and removes the note on success.
 * 
 * APPROACH TO JSONPLACEHOLDER MOCK PERSISTENCE:
 * JSONPlaceholder is a mock REST service that simulates mutations in memory per-request,
 * meaning resources created via POST (e.g. id 101) are not actually stored in a persistent
 * database.
 * 
 * However, JSONPlaceholder is specifically configured to mock successful REST calls:
 * sending `DELETE /posts/{id}` for ANY id (including newly simulated IDs like 101)
 * still returns HTTP 200 OK with an empty body `{}`.
 * 
 * Our approach:
 * 1. Always fire the real HTTP DELETE request to preserve realistic network cycles, status
 *    code checks (`response.ok`), and async state toggles.
 * 2. Only remove the item from the local DOM once `request()` successfully completes.
 * 3. If a network disruption occurs or the server returns an error status, the note is kept
 *    in the UI and an error is reported to the user.
 * 
 * @param {number|string} id 
 * @param {HTMLLIElement} noteElement 
 */
async function deleteNote(id, noteElement) {
  setStatus('loading', `Deleting note ${id}...`);
  setButtonsDisabled(true);

  try {
    const { status } = await request(`${API_URL}/${id}`, {
      method: 'DELETE'
    });

    // Remove the note element from the DOM
    noteElement.remove();

    // Show empty state if all notes are gone
    if (notesList.children.length === 0) {
      renderEmptyState('No notes remaining.');
    }

    setStatus('success', `Note ${id} deleted successfully (status ${status}).`);
  } catch (error) {
    setStatus('error', `Failed to delete note ${id}. Please try again.`);
  } finally {
    setButtonsDisabled(false);
  }
}

// Initial state on page load
renderEmptyState('Click "Load notes" to fetch data from the server.');

// Event Listeners
loadBtn.addEventListener('click', loadNotes);
noteForm.addEventListener('submit', createNote);
