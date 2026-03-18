// Sheet Music Creator
const canvas = document.getElementById('sheet-music-canvas');
const ctx = canvas.getContext('2d');
const lyricsLineDragHandle = document.getElementById('lyrics-line-drag-handle');

// Canvas dimensions
const STAFF_WIDTH = 1400;
const STAFF_TOP = 160; // top of first staff system (increased to give more space for title/key)
const STAFF_SPACING = 20; // Space between staff lines
const NOTE_WIDTH = 30;
const NOTE_HEIGHT = 20;
// Horizontal grid size for note columns (controls spacing between notes).
// Larger value = notes further apart. Slightly tightened to fit more notes while staying readable.
const NOTE_COLUMN_WIDTH = 60;

// Multi-staff layout
let staffCount = 1;
const SYSTEM_SPACING = 220; // vertical distance between staff systems (top-to-top)

// Lyrics edit mode and single lyrics text (free-form, not per-note)
let isLyricsEditMode = false;
let lyricsText = '';

// Manual vertical offset for the lyrics line (pixels). Positive = lower, negative = higher.
let lyricsLineOffset = 0;
const LYRICS_LINE_OFFSET_MIN = -80;
const LYRICS_LINE_OFFSET_MAX = 120;
let draggingLyricsLine = false;
let lyricsDragStartY = 0;
let lyricsDragStartOffset = 0;
let justFinishedDraggingLyrics = false;

function getStaffTop(staffIndex) {
    return STAFF_TOP + staffIndex * SYSTEM_SPACING;
}

function getStaffLines(staffIndex) {
    const top = getStaffTop(staffIndex);
    return [0, 1, 2, 3, 4].map(i => top + i * STAFF_SPACING);
}

// Base staff line positions for the first staff system.
// These are used by the legacy pitch->Y lookup tables below.
const STAFF_LINES = getStaffLines(0);

function resizeCanvas() {
    canvas.width = STAFF_WIDTH;
    const lastTop = getStaffTop(staffCount - 1);
    const bottomOfLastStaff = lastTop + STAFF_SPACING * 4;
    // Extra padding for ledger lines + hover
    canvas.height = Math.max(400, bottomOfLastStaff + 140);
    if (isLyricsEditMode) positionLyricsOverlay();
    // Don't call positionLyricsLineDragHandle here — it uses LYRICS_LINE_DRAG_THRESHOLD which isn't defined yet on first run. Redraw will position it.
}

// Convert a staff "step" to a canvas Y coordinate.
// Define step 0 as the BOTTOM line of the staff, and each line/space is +1 step.
// So: bottom line = 0, space above = 1, next line = 2, ... top line = 8.
function staffStepToY(step, staffIndex) {
    const lines = getStaffLines(staffIndex);
    return lines[4] - step * (STAFF_SPACING / 2);
}

// Current clef (default: bass)
let currentClef = 'bass';

// Current key signature (default: C)
let currentKey = 'C';

// Key signature definitions
// Order of sharps: F, C, G, D, A, E, B
// Order of flats: B, E, A, D, G, C, F
const KEY_SIGNATURES = {
    'C': { type: 'none', accidentals: [] },
    'G': { type: 'sharp', accidentals: ['F'] },
    'D': { type: 'sharp', accidentals: ['F', 'C'] },
    'A': { type: 'sharp', accidentals: ['F', 'C', 'G'] },
    'E': { type: 'sharp', accidentals: ['F', 'C', 'G', 'D'] },
    'B': { type: 'sharp', accidentals: ['F', 'C', 'G', 'D', 'A'] },
    'F#': { type: 'sharp', accidentals: ['F', 'C', 'G', 'D', 'A', 'E'] },
    'C#': { type: 'sharp', accidentals: ['F', 'C', 'G', 'D', 'A', 'E', 'B'] },
    'F': { type: 'flat', accidentals: ['B'] },
    'Bb': { type: 'flat', accidentals: ['B', 'E'] },
    'Eb': { type: 'flat', accidentals: ['B', 'E', 'A'] },
    'Ab': { type: 'flat', accidentals: ['B', 'E', 'A', 'D'] },
    'Db': { type: 'flat', accidentals: ['B', 'E', 'A', 'D', 'G'] },
    'Gb': { type: 'flat', accidentals: ['B', 'E', 'A', 'D', 'G', 'C'] },
    'Cb': { type: 'flat', accidentals: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] }
};

// Treble key signature placement using staff steps (most robust).
// Step 0 = bottom line, step 8 = top line.
// Sharps (F C G D A E B) standard treble steps:
// F#: 8 (top line), C#: 5 (3rd space), G#: 2 (2nd line), D#: 6 (4th line),
// A#: 3 (2nd space), E#: 7 (top space), B#: 4 (middle line)
const TREBLE_SHARP_STEPS = {
    'F': 8,
    'C': 5,
    // Style tweak: render G# one octave higher (7 staff-steps) to match your reference look.
    'G': 9,
    'D': 6,
    'A': 3,
    'E': 7,
    'B': 4
};

// Flats (B E A D G C F) standard treble steps:
// Bb: 4 (middle line), Eb: 7 (top space), Ab: 3 (2nd space), Db: 6 (4th line),
// Gb: 2 (2nd line), Cb: 5 (3rd space), Fb: 8 (top line)
const TREBLE_FLAT_STEPS = {
    'B': 4,
    'E': 7,
    'A': 3,
    'D': 6,
    'G': 2,
    'C': 5,
    'F': 8
};

// Staff positions for sharps and flats in bass clef.
// Here we specify the actual pitch (note+octave) for each accidental,
// then reuse the existing BASS_NOTE_POSITIONS mapping so the glyphs
// sit exactly where that pitch would be on the staff.
// Lines (bottom to top): G2, B2, D3, F3, A3
// Spaces: A2, C3, E3, G3
const BASS_SHARP_POSITIONS = {
    // Sharps in order: F, C, G, D, A, E, B
    // Use octave 2 so the accidentals sit on the main staff
    'F': 'F2',
    'C': 'C2',
    'G': 'G2',
    'D': 'D2',
    'A': 'A2',
    'E': 'E2',
    'B': 'B2'
};

const BASS_FLAT_POSITIONS = {
    // Flats in order: B, E, A, D, G, C, F
    // Use a mix of octave 1/2 so the pattern matches standard bass-clef engraving
    // *within this app’s staff coordinate system* (which is effectively 1 octave lower).
    'B': 'B1',
    'E': 'E2',
    'A': 'A1',
    'D': 'D2',
    'G': 'G1',
    'C': 'C2',
    'F': 'F1'
};

// Note positions for Treble Clef
// In treble clef, E4 is on the first line, G4 is on the second line
const TREBLE_NOTE_POSITIONS = {
    // Octave 2
    'C2': STAFF_LINES[4] + STAFF_SPACING * 2,
    'D2': STAFF_LINES[4] + STAFF_SPACING * 1.5,
    'E2': STAFF_LINES[4] + STAFF_SPACING,
    'F2': STAFF_LINES[4] + STAFF_SPACING * 0.5,
    'G2': STAFF_LINES[4],
    'A2': STAFF_LINES[3] + STAFF_SPACING * 0.5,
    'B2': STAFF_LINES[3],
    // Octave 3
    'C3': STAFF_LINES[2] + STAFF_SPACING * 0.5,
    'D3': STAFF_LINES[2],
    'E3': STAFF_LINES[1] + STAFF_SPACING * 0.5,
    'F3': STAFF_LINES[1],
    'G3': STAFF_LINES[0] + STAFF_SPACING * 0.5,
    'A3': STAFF_LINES[0],
    'B3': STAFF_LINES[0] - STAFF_SPACING * 0.5,
    // Octave 4 (middle C and above)
    'C4': STAFF_LINES[0] - STAFF_SPACING,
    'D4': STAFF_LINES[0] - STAFF_SPACING * 1.5,
    'E4': STAFF_LINES[0] - STAFF_SPACING * 2,
    'F4': STAFF_LINES[0] - STAFF_SPACING * 2.5,
    'G4': STAFF_LINES[0] - STAFF_SPACING * 3,
    'A4': STAFF_LINES[0] - STAFF_SPACING * 3.5,
    'B4': STAFF_LINES[0] - STAFF_SPACING * 4,
    // Octave 5
    'C5': STAFF_LINES[0] - STAFF_SPACING * 4.5,
    'D5': STAFF_LINES[0] - STAFF_SPACING * 5,
    'E5': STAFF_LINES[0] - STAFF_SPACING * 5.5,
    'F5': STAFF_LINES[0] - STAFF_SPACING * 6,
    'G5': STAFF_LINES[0] - STAFF_SPACING * 6.5,
    'A5': STAFF_LINES[0] - STAFF_SPACING * 7,
    'B5': STAFF_LINES[0] - STAFF_SPACING * 7.5,
};

// Note positions for Bass Clef
// In bass clef, G2 is on the first line, F3 is on the 4th line
const BASS_NOTE_POSITIONS = {
    // Octave 1
    'C1': STAFF_LINES[4] + STAFF_SPACING * 2,
    'D1': STAFF_LINES[4] + STAFF_SPACING * 1.5,
    'E1': STAFF_LINES[4] + STAFF_SPACING,
    'F1': STAFF_LINES[4] + STAFF_SPACING * 0.5,
    'G1': STAFF_LINES[4],
    'A1': STAFF_LINES[3] + STAFF_SPACING * 0.5,
    'B1': STAFF_LINES[3],
    // Octave 2
    'C2': STAFF_LINES[2] + STAFF_SPACING * 0.5,
    'D2': STAFF_LINES[2],
    'E2': STAFF_LINES[1] + STAFF_SPACING * 0.5,
    'F2': STAFF_LINES[1],
    'G2': STAFF_LINES[0] + STAFF_SPACING * 0.5,
    'A2': STAFF_LINES[0],
    'B2': STAFF_LINES[0] - STAFF_SPACING * 0.5,
    // Octave 3
    'C3': STAFF_LINES[0] - STAFF_SPACING,
    'D3': STAFF_LINES[0] - STAFF_SPACING * 1.5,
    'E3': STAFF_LINES[0] - STAFF_SPACING * 2,
    'F3': STAFF_LINES[0] - STAFF_SPACING * 2.5,
    'G3': STAFF_LINES[0] - STAFF_SPACING * 3,
    'A3': STAFF_LINES[0] - STAFF_SPACING * 3.5,
    'B3': STAFF_LINES[0] - STAFF_SPACING * 4,
    // Octave 4 (middle C and above)
    'C4': STAFF_LINES[0] - STAFF_SPACING * 4.5,
    'D4': STAFF_LINES[0] - STAFF_SPACING * 5,
    'E4': STAFF_LINES[0] - STAFF_SPACING * 5.5,
    'F4': STAFF_LINES[0] - STAFF_SPACING * 6,
    'G4': STAFF_LINES[0] - STAFF_SPACING * 6.5,
    'A4': STAFF_LINES[0] - STAFF_SPACING * 7,
    'B4': STAFF_LINES[0] - STAFF_SPACING * 7.5,
};

// Sharps and flats
const SHARP_POSITIONS = {
    'C#': 'C', 'D#': 'D', 'F#': 'F', 'G#': 'G', 'A#': 'A'
};

// Store notes
let notes = [];
let noteHistory = [];
// Store original notes before flat conversion (for revert)
let originalNotesBeforeConversion = null;

// Edit mode state
// (Edit mode removed; notes are edited directly.)

// Store title
let sheetTitle = '';

// Hover preview + selection state
let hoveredPlacement = null; // { x, staffIndex, step, y, note, octave, duration }
let selectedNoteId = null;
let hoveredNoteId = null;
let nextNoteId = 1;

// Note drag state
let draggingNote = null; // { noteId, staffIndex, anchorOffsetY, didMove }
let suppressNextClick = false;

// Selected note duration (set by Note shortcut bar or keys 1–5)
let currentDuration = 'quarter';

// Set initial canvas size
resizeCanvas();

// Get note key (e.g., "C4", "C#4")
function getNoteKey(note, octave) {
    return note + octave;
}

// Get Y position for a note based on current clef
function getNoteYPosition(note, octave) {
    // Legacy helper kept for key signature mapping; for notes we prefer step-based Y.
    // Handle sharps/flats by using the base note.
    const baseNote = note.replace('#', '').replace('b', '');
    const noteKey = getNoteKey(baseNote, octave);
    const positions = currentClef === 'bass' ? BASS_NOTE_POSITIONS : TREBLE_NOTE_POSITIONS;
    // Fallback to a "middle-ish" position on the *first* staff.
    const staffLines0 = getStaffLines(0);
    return positions[noteKey] || staffLines0[2];
}

function pitchToStaffStep(letter, octave, clef) {
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const startOctave = clef === 'bass' ? 1 : 2;
    const startLetterIndex = letters.indexOf('G'); // step 0 is bottom line which is G

    const targetLetterIndex = letters.indexOf(letter);
    const targetOctave = Number(octave);
    if (targetLetterIndex === -1 || Number.isNaN(targetOctave)) return null;

    // Brute-force search a reasonable step range to find the matching pitch.
    // This keeps behavior consistent with staffStepToPitch().
    for (let step = -40; step <= 60; step++) {
        // replicate staffStepToPitch logic, but parameterized
        let o = startOctave;
        if (step >= 0) {
            for (let i = 0; i < step; i++) {
                const from = letters[(startLetterIndex + i) % 7];
                const to = letters[(startLetterIndex + i + 1) % 7];
                if (from === 'B' && to === 'C') o++;
            }
        } else {
            for (let i = 0; i > step; i--) {
                const from = letters[((startLetterIndex + i) % 7 + 7) % 7];
                const to = letters[((startLetterIndex + i - 1) % 7 + 7) % 7];
                if (from === 'C' && to === 'B') o--;
            }
        }

        const idx = startLetterIndex + step;
        const l = letters[((idx % 7) + 7) % 7];
        if (l === letter && o === targetOctave) return step;
    }

    return null;
}

// Draw key signature
function drawKeySignature(staffIndex) {
    const keySig = KEY_SIGNATURES[currentKey];
    if (!keySig || keySig.type === 'none' || keySig.accidentals.length === 0) {
        return;
    }
    
    // Prevent text settings (baseline/align/font) from leaking into other drawing operations (e.g. clef).
    ctx.save();
    
    const positions = currentClef === 'bass'
        ? (keySig.type === 'sharp' ? BASS_SHARP_POSITIONS : BASS_FLAT_POSITIONS)
        : null;
    const trebleSteps = currentClef === 'treble'
        ? (keySig.type === 'sharp' ? TREBLE_SHARP_STEPS : TREBLE_FLAT_STEPS)
        : null;
    
    // Start position after clef (clef is ~80px wide, start at 140px)
    let xPosition = 140;
    const spacing = 18; // Space between accidentals (tighter like standard engraving)
    
    ctx.font = '32px serif';
    ctx.fillStyle = '#333';
    // Make placement consistent on lines/spaces by centering glyphs vertically.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    
    keySig.accidentals.forEach((note, index) => {
        let yPosition = null;

        if (currentClef === 'treble') {
            const step = trebleSteps?.[note];
            if (typeof step === 'number') {
                yPosition = staffStepToY(step, staffIndex);
            }
        } else {
            yPosition = positions?.[note];
        }

        // For treble/bass clef, we may store pitches like "F5" and map them
        // through the existing note-position logic.
        if (typeof yPosition === 'string') {
            const letter = yPosition.slice(0, -1);
            const octave = yPosition.slice(-1);
            const step = pitchToStaffStep(letter, octave, 'bass');
            if (typeof step === 'number') {
                yPosition = staffStepToY(step, staffIndex);
            } else {
                yPosition = null;
            }
        }
        if (yPosition !== undefined) {
            if (keySig.type === 'sharp') {
                ctx.fillText('♯', xPosition, yPosition);
            } else {
                ctx.fillText('♭', xPosition, yPosition);
            }
            xPosition += spacing;
        }
    });
    
    ctx.restore();
}

// Draw staff lines
function drawStaff(staffIndex) {
    const STAFF_LINES = getStaffLines(staffIndex);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    
    // Draw 5 staff lines
    STAFF_LINES.forEach((y, index) => {
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(STAFF_WIDTH - 50, y);
        ctx.stroke();
    });
    
    // Draw clef symbol (bigger and based on current clef)
    // Treble clef is typically taller; also center it vertically on the staff.
    ctx.save();
    ctx.font = currentClef === 'treble' ? '125px serif' : '110px serif';
    ctx.fillStyle = '#333';
    // Ensure consistent positioning regardless of what other functions set.
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const clefSymbol = currentClef === 'bass' ? '𝄢' : '𝄞';
    // Position clef to align nicely with staff (baseline-tuned by eye)
    const clefY = currentClef === 'bass'
        ? (STAFF_LINES[2] + 35)
        : (STAFF_LINES[2] + 45);
    ctx.fillText(clefSymbol, 50, clefY);
    ctx.restore();
    
    // Draw key signature after clef
    drawKeySignature(staffIndex);
}

// Baseline Y for the lyrics line under a staff (staff 0 uses lyricsLineOffset for manual positioning).
function getLyricsBaselineY(staffIndex) {
    const STAFF_LINES = getStaffLines(staffIndex);
    const base = STAFF_LINES[4] + STAFF_SPACING * 1.2;
    return staffIndex === 0 ? base + lyricsLineOffset : base;
}

// Draw the horizontal guideline where lyrics will sit under this staff
function drawLyricsLine(staffIndex) {
    const baselineY = getLyricsBaselineY(staffIndex);
    ctx.save();
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(50, baselineY);
    ctx.lineTo(STAFF_WIDTH - 50, baselineY);
    ctx.stroke();
    ctx.restore();
}

// Draw lyrics text under each staff (free-form; line i goes under staff i).
// When in lyrics edit mode we don't draw—the overlay textarea is shown instead.
function drawLyricsForStaff(staffIndex) {
    if (isLyricsEditMode) return;
    const lines = lyricsText.split('\n');
    const line = lines[staffIndex];
    if (!line || line.trim() === '') return;
    const startY = getLyricsBaselineY(staffIndex);
    ctx.save();
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const leftX = 50; // align with left edge of staff
    ctx.fillText(line, leftX, startY);
    ctx.restore();
}

// Height of one staff's lyrics zone (for overlay layout)
const LYRICS_ZONE_HEIGHT_PER_STAFF = 88;

// Bounds (in canvas pixels) for the lyrics zone under a single staff. Left edge of staff (x=50).
function getLyricsOverlayRect(staffIndex) {
    const baselineY = getLyricsBaselineY(staffIndex);
    const top = baselineY - STAFF_SPACING * 0.7;
    const left = 50;
    const width = STAFF_WIDTH - left - 24;
    const height = LYRICS_ZONE_HEIGHT_PER_STAFF;
    return { left, top, width, height };
}

// Hit test for the draggable lyrics line (staff 0 only). Used for drag and cursor.
const LYRICS_LINE_DRAG_THRESHOLD = 12;
function isPointOnLyricsLine(x, y) {
    const baselineY = getLyricsBaselineY(0);
    if (y < baselineY - LYRICS_LINE_DRAG_THRESHOLD || y > baselineY + LYRICS_LINE_DRAG_THRESHOLD) return false;
    return x >= 50 && x <= STAFF_WIDTH - 50;
}

// Get the lyrics textarea for a given staff (when in lyrics edit mode). Used for snap-to-note.
function getLyricsTextareaForStaff(staffIndex) {
    if (!lyricsOverlaysContainer) return null;
    const overlay = lyricsOverlaysContainer.children[staffIndex];
    return overlay ? overlay.querySelector('textarea') : null;
}

// One overlay + textarea per staff. Create/update when entering lyrics mode or on resize.
function ensureLyricsOverlays() {
    if (!lyricsOverlaysContainer) return;
    const lines = lyricsText.split('\n');
    while (lyricsOverlaysContainer.children.length > staffCount) {
        lyricsOverlaysContainer.lastChild.remove();
    }
    while (lyricsOverlaysContainer.children.length < staffCount) {
        const overlay = document.createElement('div');
        overlay.className = 'lyrics-overlay';
        const ta = document.createElement('textarea');
        ta.className = 'lyrics-inline-input';
        ta.placeholder = 'Type lyrics here…';
        ta.setAttribute('autocomplete', 'off');
        ta.setAttribute('autocorrect', 'off');
        ta.setAttribute('autocapitalize', 'off');
        ta.setAttribute('spellcheck', 'false');
        ta.dataset.staffIndex = String(lyricsOverlaysContainer.children.length);
        overlay.appendChild(ta);
        lyricsOverlaysContainer.appendChild(overlay);
        addLyricsTextareaKeydown(ta);
        addLyricsTextareaInputFilter(ta);
    }
    for (let i = 0; i < staffCount; i++) {
        const overlay = lyricsOverlaysContainer.children[i];
        const ta = overlay.querySelector('textarea');
        const r = getLyricsOverlayRect(i);
        overlay.style.left = r.left + 'px';
        overlay.style.top = r.top + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
        ta.value = lines[i] || '';
        if (ta._lastLyricsValue !== undefined) ta._lastLyricsValue = ta.value;
        ta.dataset.staffIndex = String(i);
    }
}

function positionLyricsOverlay() {
    if (!isLyricsEditMode || !lyricsOverlaysContainer) return;
    ensureLyricsOverlays();
}

// Position and show/hide the lyrics line drag handle (over the dashed line for staff 0).
function positionLyricsLineDragHandle() {
    if (!lyricsLineDragHandle) return;
    if (isLyricsEditMode) {
        lyricsLineDragHandle.classList.add('hidden');
        lyricsLineDragHandle.setAttribute('aria-hidden', 'true');
        return;
    }
    const baselineY = getLyricsBaselineY(0);
    const top = baselineY - LYRICS_LINE_DRAG_THRESHOLD;
    const height = LYRICS_LINE_DRAG_THRESHOLD * 2;
    lyricsLineDragHandle.style.left = '50px';
    lyricsLineDragHandle.style.top = top + 'px';
    lyricsLineDragHandle.style.width = (STAFF_WIDTH - 100) + 'px';
    lyricsLineDragHandle.style.height = height + 'px';
    lyricsLineDragHandle.classList.remove('hidden');
    lyricsLineDragHandle.setAttribute('aria-hidden', 'false');
}

// Measure text width using a hidden span; copy textarea's computed font so it matches exactly.
let _measureSpan = null;
function getTextWidth(text, textareaEl) {
    if (!_measureSpan) {
        _measureSpan = document.createElement('span');
        _measureSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
        document.body.appendChild(_measureSpan);
    }
    const ta = textareaEl || getLyricsTextareaForStaff(0);
    if (ta) {
        const s = window.getComputedStyle(ta);
        _measureSpan.style.font = s.font;
        _measureSpan.style.letterSpacing = s.letterSpacing;
    }
    _measureSpan.textContent = text;
    return _measureSpan.getBoundingClientRect().width;
}

// Compute distance (CSS px) from textarea text start to the note, and current first-line width.
function getNoteOffsetAndLineWidth(noteX, textareaEl) {
    if (!textareaEl) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const textareaRect = textareaEl.getBoundingClientRect();
    const scale = canvasRect.width / canvas.width;
    const style = window.getComputedStyle(textareaEl);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const noteXViewport = canvasRect.left + noteX * scale;
    const textStartX = textareaRect.left + paddingLeft;
    const relXCss = noteXViewport - textStartX;
    const text = textareaEl.value;
    const firstNewline = text.indexOf('\n');
    const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
    const lineWidth = getTextWidth(firstLine, textareaEl);
    return { relXCss, firstLine, firstNewline, text, lineWidth };
}

// Snap cursor under the note. Uses the textarea for the note's staff.
function snapLyricsCursorToNote(note) {
    const staffIndex = note.staffIndex ?? 0;
    const ta = getLyricsTextareaForStaff(staffIndex);
    if (!ta) return;
    const data = getNoteOffsetAndLineWidth(note.x, ta);
    if (!data) return;
    const { relXCss, firstLine, firstNewline, text, lineWidth } = data;
    if (relXCss <= 0) {
        ta.setSelectionRange(0, 0);
        ta.focus();
        return;
    }

    let newValue = text;
    let cursorPos;

    if (relXCss > lineWidth) {
        const spaceWidth = getTextWidth(' ', ta);
        const needWidth = relXCss - lineWidth;
        let numSpaces = spaceWidth > 0 ? Math.max(0, Math.ceil(needWidth / spaceWidth)) : 0;
        numSpaces = Math.max(0, numSpaces - 5);
        const spaces = ' '.repeat(numSpaces);
        if (firstNewline === -1) {
            newValue = firstLine + spaces;
            cursorPos = firstLine.length + numSpaces;
        } else {
            newValue = firstLine + spaces + '\n' + text.slice(firstNewline + 1);
            cursorPos = firstLine.length + numSpaces;
        }
        ta.value = newValue;
    } else {
        let i = 0;
        while (i <= firstLine.length) {
            if (getTextWidth(firstLine.slice(0, i), ta) <= relXCss) i++;
            else break;
        }
        cursorPos = Math.min(i, firstLine.length);
    }

    const safeIdx = Math.max(0, Math.min(cursorPos, ta.value.length));
    const applySelection = () => {
        ta.setSelectionRange(safeIdx, safeIdx);
        ta.focus();
    };
    setTimeout(applySelection, 0);
    setTimeout(applySelection, 100);
}

// Draw a note
function drawNote(x, staffIndex, step, note, octave, duration, isSelected = false, isPreview = false, options = {}) {
    const noteKey = getNoteKey(note, octave);
    const STAFF_LINES = getStaffLines(staffIndex);
    const noteY = staffStepToY(step, staffIndex);
    
    // Draw note head: whole note = thick black oval with white hollow; half = stroke-only hollow; quarter and shorter = filled
    const isHollow = duration === 'whole' || duration === 'half';
    const strokeColor = '#000';
    const fillColor = '#000';

    ctx.beginPath();
    ctx.ellipse(x, noteY, NOTE_WIDTH / 2, NOTE_HEIGHT / 2, 0, 0, 2 * Math.PI);
    if (duration === 'whole') {
        // Whole note: thick black oval with clear white hollow (match reference exactly)
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(x, noteY, (NOTE_WIDTH / 2) * 0.72, (NOTE_HEIGHT / 2) * 0.72, 0, 0, 2 * Math.PI);
        ctx.fill();
    } else if (isHollow) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    } else {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    if (isPreview) {
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.ellipse(x, noteY, NOTE_WIDTH / 2 + 3, NOTE_HEIGHT / 2 + 3, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    
    const shouldDrawStem = duration !== 'whole' && (options.drawStem ?? true);

    // Draw stem if not whole note (and not suppressed, e.g. for beamed notes)
    if (shouldDrawStem) {
        const stemLength = duration === 'half' ? 60 : 80;
        // Pass full positioning info so stems are correctly placed and perfectly vertical
        const geom = getStemGeometry(
            {
                x,
                note,
                octave,
                duration,
                step,
                staffIndex
            },
            stemLength
        );
        const stemX = geom.stemX;
        const stemStartY = geom.stemStartY;
        const stemEndY = geom.stemEndY;
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stemX, stemStartY);
        ctx.lineTo(stemX, stemEndY);
        ctx.stroke();
        
        // Flags are handled in a separate beaming pass for runs of 8th/16th notes.
        // We only draw flags here when the note is not beamed.
        if ((duration === 'eighth' || duration === 'sixteenth') && !isPreview) {
            // If the note is part of a beam group, redraw() will skip flags via drawFlagsForUnbeamedNotes().
            // (We keep this empty here to avoid double-drawing.)
        }
    }
    
    // Draw accidental if needed.
    // Prefer an explicit accidental set via the Edit Note popup so that
    // naturals (♮) can be shown even when the stored pitch is the plain letter.
    let explicitAccidental = null;
    if (typeof arguments[5] === 'string' && arguments.length >= 7 && typeof arguments[6] === 'boolean') {
        // no-op: keep signature the same; actual accidental info lives on
        // the note object when redraw() calls drawNote for real notes.
    }

    // When called from redraw(), the "note" argument is just the letter (e.g. 'C', 'C#').
    // The full note object (with any explicitAccidental) is available in that path,
    // so we inspect the currently-selected note (if any) to decide whether to show ♮.
    // To keep this simple and robust, we attach an `explicitAccidental` field to each
    // note in setSelectedAccidental(), and then read it here when present.
    let accidentalToDraw = null;

    // If the caller provided a full note object (as in redraw()), prefer its explicitAccidental.
    if (typeof x === 'number' && typeof staffIndex === 'number' && typeof step === 'number') {
        // Try to find the underlying note object in the notes array.
        const underlying = notes.find(n =>
            n.x === x &&
            (n.staffIndex ?? 0) === staffIndex &&
            n.step === step &&
            n.note === note &&
            n.octave === octave &&
            n.duration === duration
        );
        if (underlying && underlying.explicitAccidental) {
            explicitAccidental = underlying.explicitAccidental;
        }
    }

    if (explicitAccidental === 'sharp') {
        accidentalToDraw = 'sharp';
    } else if (explicitAccidental === 'flat') {
        accidentalToDraw = 'flat';
    } else if (explicitAccidental === 'natural') {
        accidentalToDraw = 'natural';
    } else {
        // Fallback: infer from the note name if no explicit override exists.
        if (note.includes('#')) accidentalToDraw = 'sharp';
        else if (note.includes('b')) accidentalToDraw = 'flat';
    }

    if (accidentalToDraw) {
        ctx.font = '24px serif';
        const accidentalOffsetX = 36; // small extra spacing so accidentals aren't squished against the note head
        if (accidentalToDraw === 'sharp') {
            ctx.fillText('♯', x - accidentalOffsetX, noteY + 8);
        } else if (accidentalToDraw === 'flat') {
            ctx.fillText('♭', x - accidentalOffsetX, noteY + 8);
        } else if (accidentalToDraw === 'natural') {
            ctx.fillText('♮', x - accidentalOffsetX, noteY + 8);
        }
    }
    
    // Draw ledger lines if needed
    if (noteY > STAFF_LINES[4] + STAFF_SPACING * 0.5) {
        // Below staff
        const ledgerY = STAFF_LINES[4] + STAFF_SPACING;
        ctx.beginPath();
        ctx.moveTo(x - NOTE_WIDTH / 2 - 5, ledgerY);
        ctx.lineTo(x + NOTE_WIDTH / 2 + 5, ledgerY);
        ctx.stroke();
    } else if (noteY < STAFF_LINES[0] - STAFF_SPACING * 0.5) {
        // Above staff
        const ledgerY = STAFF_LINES[0] - STAFF_SPACING;
        ctx.beginPath();
        ctx.moveTo(x - NOTE_WIDTH / 2 - 5, ledgerY);
        ctx.lineTo(x + NOTE_WIDTH / 2 + 5, ledgerY);
        ctx.stroke();
    }
}

function getStemGeometry(note, stemLengthOverride = null) {
    const STAFF_LINES = getStaffLines(note.staffIndex ?? 0);
    const noteY = staffStepToY(note.step, note.staffIndex ?? 0);
    const duration = note.duration;
    const stemLength = stemLengthOverride ?? (duration === 'half' ? 60 : 80);

    // Consistent stem direction:
    // - Notes above the middle line: stem down (left side)
    // - Notes on/below middle line: stem up (right side)
    const direction = noteY < STAFF_LINES[2] ? 'down' : 'up';
    const stemX = direction === 'up' ? (note.x + NOTE_WIDTH / 2) : (note.x - NOTE_WIDTH / 2);
    const stemStartY = noteY;
    const stemEndY = direction === 'up' ? (noteY - stemLength) : (noteY + stemLength);
    return { direction, stemX, stemStartY, stemEndY, noteY };
}

function isBeamableDuration(duration) {
    return duration === 'eighth' || duration === 'sixteenth';
}

const MAX_NOTES_PER_BEAM = 4;

// Split a run of beamable notes into groups of at most MAX_NOTES_PER_BEAM.
// Only groups with 2+ notes are returned (single notes get flags instead).
function splitBeamRunIntoGroups(run) {
    const result = [];
    for (let i = 0; i < run.length; i += MAX_NOTES_PER_BEAM) {
        const chunk = run.slice(i, i + MAX_NOTES_PER_BEAM);
        if (chunk.length >= 2) result.push(chunk);
    }
    return result;
}

function computeBeamGroups(notesIn) {
    const sorted = [...notesIn].sort((a, b) => a.x - b.x);
    const groups = [];
    let current = [];

    for (const n of sorted) {
        if (!isBeamableDuration(n.duration)) {
            groups.push(...splitBeamRunIntoGroups(current));
            current = [];
            continue;
        }
        if (current.length === 0) {
            current.push(n);
            continue;
        }
        const prev = current[current.length - 1];
        const dx = Math.abs(n.x - prev.x);
        // Only beam notes of the same duration: 2–4 eighth notes or 2–4 sixteenth notes.
        // Do not combine 8ths with 16ths in the same beam.
        const sameDuration = n.duration === prev.duration;
        const adjacent = dx <= NOTE_COLUMN_WIDTH * 1.5;
        if (sameDuration && adjacent) {
            current.push(n);
        } else {
            groups.push(...splitBeamRunIntoGroups(current));
            current = [n];
        }
    }
    groups.push(...splitBeamRunIntoGroups(current));

    return groups;
}

function drawBeams(groups) {
    const BEAM_THICKNESS = 6;
    const BEAM_GAP = 10; // distance between 1st and 2nd beam for sixteenths
    ctx.save();
    ctx.fillStyle = '#000';

    for (const group of groups) {
        const staffIndex = group[0]?.staffIndex ?? 0;
        const STAFF_LINES = getStaffLines(staffIndex);
        // Choose a single stem direction for the group based on average note position
        const avgY = group.reduce((sum, n) => sum + staffStepToY(n.step, n.staffIndex ?? staffIndex), 0) / group.length;
        const direction = avgY < STAFF_LINES[2] ? 'down' : 'up';

        const stemGeoms = group.map(n => {
            const geom = getStemGeometry(n);
            // Force group direction so beams align
            if (geom.direction !== direction) {
                const stemLength = (n.duration === 'half' ? 60 : 80);
                const noteY = geom.noteY;
                const stemX = direction === 'up' ? (n.x + NOTE_WIDTH / 2) : (n.x - NOTE_WIDTH / 2);
                const stemStartY = noteY;
                const stemEndY = direction === 'up' ? (noteY - stemLength) : (noteY + stemLength);
                return { ...geom, direction, stemX, stemStartY, stemEndY };
            }
            return geom;
        });

        // Flat beam line (no slope) at extremum of stem ends so it clears all notes
        const beamY = direction === 'up'
            ? Math.min(...stemGeoms.map(g => g.stemEndY))
            : Math.max(...stemGeoms.map(g => g.stemEndY));

        const firstX = stemGeoms[0].stemX;
        const lastX = stemGeoms[stemGeoms.length - 1].stemX;

        // Primary beam (8th+)
        const yTop = direction === 'up' ? beamY : beamY;
        const rectY = direction === 'up' ? (yTop) : (yTop);
        ctx.fillRect(
            Math.min(firstX, lastX),
            direction === 'up' ? rectY : rectY,
            Math.abs(lastX - firstX),
            direction === 'up' ? BEAM_THICKNESS : BEAM_THICKNESS
        );

        // Draw stems to meet the beam
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        for (const g of stemGeoms) {
            ctx.beginPath();
            ctx.moveTo(g.stemX, g.stemStartY);
            ctx.lineTo(g.stemX, beamY);
            ctx.stroke();
        }

        // Secondary beams for sixteenths: only connect consecutive sixteenth notes
        const hasSixteenth = group.some(n => n.duration === 'sixteenth');
        if (hasSixteenth) {
            for (let i = 0; i < group.length - 1; i++) {
                const a = group[i];
                const b = group[i + 1];
                if (a.duration === 'sixteenth' && b.duration === 'sixteenth') {
                    const ax = stemGeoms[i].stemX;
                    const bx = stemGeoms[i + 1].stemX;
                    const offset = direction === 'up' ? (BEAM_GAP + BEAM_THICKNESS) : -(BEAM_GAP + BEAM_THICKNESS);
                    const y2 = beamY + offset;
                    ctx.fillRect(
                        Math.min(ax, bx),
                        y2,
                        Math.abs(bx - ax),
                        BEAM_THICKNESS
                    );
                }
            }
        }
    }

    ctx.restore();
}

function drawFlagsForUnbeamedNotes(notesIn, beamedNoteIds) {
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    for (const n of notesIn) {
        if (!isBeamableDuration(n.duration)) continue;
        if (beamedNoteIds.has(n.id)) continue;
        const geom = getStemGeometry(n);
        const stemX = geom.stemX;
        const flagY = geom.direction === 'up' ? geom.stemEndY : geom.stemEndY;
        const dir = geom.direction === 'up' ? 1 : -1;

        // Simple flags (kept similar to prior look)
        ctx.beginPath();
        ctx.moveTo(stemX, flagY);
        ctx.quadraticCurveTo(stemX + 12 * dir, flagY + 10 * dir, stemX + 16 * dir, flagY + 5 * dir);
        ctx.stroke();

        if (n.duration === 'sixteenth') {
            ctx.beginPath();
            ctx.moveTo(stemX, flagY + 12 * dir);
            ctx.quadraticCurveTo(stemX + 12 * dir, flagY + 22 * dir, stemX + 16 * dir, flagY + 17 * dir);
            ctx.stroke();
        }
    }
    ctx.restore();
}

// Find the highest (smallest Y) drawn content from notes and hover preview
function getHighestContentY() {
    let minY = Infinity;

    // Existing notes
    for (const n of notes) {
        const y = staffStepToY(n.step, n.staffIndex ?? 0);
        if (y < minY) minY = y;
    }

    // Hover preview note
    if (hoveredPlacement) {
        if (hoveredPlacement.y < minY) minY = hoveredPlacement.y;
    }

    return Number.isFinite(minY) ? minY : null;
}

// Draw title and key label
function drawTitleAndKey() {
    if (!sheetTitle) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const centerX = STAFF_WIDTH / 2;

    // Base positions and sizing for title block
    const baseTitleY = 20;
    const keyOffsetFromTitle = 44;   // vertical distance from title to "Key of ..."
    const approximateTitleHeight = 40;
    const approximateKeyHeight = 26;
    const blockHeight = approximateTitleHeight + keyOffsetFromTitle + approximateKeyHeight;
    const marginToNotes = 30;        // extra breathing room above highest notes (increased to be less sensitive)
    const minTitleY = 5;              // minimum Y position so title never goes off page

    // Adjust vertically if notes/hover would collide with the title block
    let titleY = baseTitleY;
    const highestContentY = getHighestContentY();
    if (highestContentY !== null) {
        const baseBlockBottom = baseTitleY + blockHeight;
        // Only adjust if notes are actually close to overlapping (within margin)
        if (highestContentY < baseBlockBottom + marginToNotes) {
            const shiftUp = baseBlockBottom + marginToNotes - highestContentY;
            titleY = Math.max(minTitleY, baseTitleY - shiftUp);
        }
    }

    // Title
    ctx.font = 'bold 48px serif';
    ctx.fillStyle = '#333';
    ctx.fillText(sheetTitle, centerX, titleY);

    // Key label under the title, using current key signature
    ctx.font = '24px serif';
    const keyLabelY = titleY + keyOffsetFromTitle;
    ctx.fillText(`Key of ${currentKey}`, centerX, keyLabelY);

    ctx.restore();
}

// Redraw everything
function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw title + key first (at the top)
    drawTitleAndKey();
    
    for (let i = 0; i < staffCount; i++) {
        drawStaff(i);
        drawLyricsLine(i);
    }

    // Pre-compute beam groups so we can avoid double-drawing stems for beamed notes.
    // Only compute beams within the same staff system.
    const groups = [];
    for (let i = 0; i < staffCount; i++) {
        const inStaff = notes.filter(n => (n.staffIndex ?? 0) === i);
        groups.push(...computeBeamGroups(inStaff));
    }
    const beamedIds = new Set();
    for (const g of groups) for (const n of g) beamedIds.add(n.id);

    // Draw all notes (noteheads + accidentals + ledger lines; stems handled here unless beamed)
    notes.forEach(note => {
        const drawStem = !(beamedIds.has(note.id) && isBeamableDuration(note.duration));
        drawNote(
            note.x,
            note.staffIndex ?? 0,
            note.step,
            note.note,
            note.octave,
            note.duration,
            note.id === selectedNoteId,
            false,
            { drawStem }
        );
    });

    // Draw lyrics text after notes so they sit cleanly under the staff
    for (let i = 0; i < staffCount; i++) {
        drawLyricsForStaff(i);
    }

    // Beam runs of adjacent 8th/16th notes (and draw flags for remaining unbeamed notes)
    drawBeams(groups);
    drawFlagsForUnbeamedNotes(notes, beamedIds);

    // Draw hover preview on top
    if (hoveredPlacement) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        drawNote(
            hoveredPlacement.x,
            hoveredPlacement.staffIndex,
            hoveredPlacement.step,
            hoveredPlacement.note,
            hoveredPlacement.octave,
            hoveredPlacement.duration,
            false,
            true
        );
        ctx.restore();
    }

    if (!isLyricsEditMode) positionLyricsLineDragHandle();
}

// Get key signature width (for note placement)
function getKeySignatureWidth() {
    const keySig = KEY_SIGNATURES[currentKey];
    if (!keySig || keySig.type === 'none' || keySig.accidentals.length === 0) {
        return 0;
    }
    // Clef width (~80px) + spacing + accidentals + padding
    // Keep this in sync with drawKeySignature()'s spacing so notes don't overlap.
    const accidentalSpacing = 18;
    return 140 + (keySig.accidentals.length * accidentalSpacing) + 20;
}

// Add note at position
function addNoteFromPlacement(placement) {
    const duration = currentDuration;
    
    // Get minimum X position (after key signature)
    const minX = getKeySignatureWidth();
    
    // Snap to grid (every 50 pixels)
    const snappedX = Math.round(placement.x / NOTE_COLUMN_WIDTH) * NOTE_COLUMN_WIDTH;
    const snappedXClamped = Math.max(minX, Math.min(STAFF_WIDTH - 100, snappedX));
    const staffIdx = placement.staffIndex ?? 0;
    if (isColumnOccupiedOnStaff(snappedXClamped, staffIdx)) return; // only one note per column per staff

    const step = placement.step;
    const pitch = staffStepToPitch(step);
    if (!pitch) return;

    const note = applyKeySignatureAccidental(pitch.letter);

    notes.push({
        id: String(nextNoteId++),
        x: snappedXClamped,
        staffIndex: placement.staffIndex ?? 0,
        step,
        y: staffStepToY(step, placement.staffIndex ?? 0),
        note,
        octave: pitch.octave,
        duration: duration
    });
    
    pushHistory();
    redraw();
}

function pushHistory() {
    // Store a deep copy so edits/selection don't mutate history
    noteHistory.push(JSON.parse(JSON.stringify(notes)));
    // Keep history from growing unbounded
    if (noteHistory.length > 200) {
        noteHistory.shift();
    }
    schedulePersistSheetToBrowser();
}

// Clear all notes (called after user confirms in tooltip)
function clearAll() {
    notes = [];
    noteHistory = [];
    selectedNoteId = null;
    hoveredPlacement = null;
    redraw();
    schedulePersistSheetToBrowser();
}

// --- Save / Open (localStorage + file) ---
const SAVE_STORAGE_KEY = 'stpatty-sheet-music-project';
const SAVE_VERSION = 1;

/** Non-null while "Resume or Delete?" dialog is showing (blocks overwriting save with empty canvas). */
var savedSongData = null;
/** 'always' after Resume/Open file (persist even when sheet cleared). 'content_only' = only when there is something to save. */
var persistMode = 'content_only';

function getStateForSave() {
    return {
        version: SAVE_VERSION,
        sheetTitle: sheetTitle || '',
        staffCount: staffCount,
        lyricsText: lyricsText || '',
        lyricsLineOffset: lyricsLineOffset,
        currentKey: currentKey,
        currentClef: currentClef,
        currentDuration: currentDuration,
        notes: JSON.parse(JSON.stringify(notes))
    };
}

function hasMeaningfulSheetState() {
    return notes.length > 0 ||
        (sheetTitle && sheetTitle.trim()) ||
        (lyricsText && lyricsText.trim()) ||
        staffCount > 1 ||
        currentKey !== 'C' ||
        currentClef !== 'treble' ||
        (currentDuration && currentDuration !== 'quarter');
}

function persistSheetToBrowserNow() {
    if (savedSongData !== null) return;
    try {
        var shouldWrite = persistMode === 'always' || hasMeaningfulSheetState();
        if (!shouldWrite) {
            if (localStorage.getItem(SAVE_STORAGE_KEY)) {
                localStorage.removeItem(SAVE_STORAGE_KEY);
            }
            return;
        }
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(getStateForSave()));
    } catch (e) { /* quota / private mode */ }
}

var _persistBrowserTimer = null;
function schedulePersistSheetToBrowser() {
    clearTimeout(_persistBrowserTimer);
    _persistBrowserTimer = setTimeout(function () {
        _persistBrowserTimer = null;
        persistSheetToBrowserNow();
    }, 400);
}

function loadState(data) {
    if (!data || typeof data !== 'object') return false;
    const v = data.version;
    if (v !== 1) return false;

    sheetTitle = data.sheetTitle || '';
    staffCount = Math.max(1, Number(data.staffCount) || 1);
    lyricsText = data.lyricsText || '';
    lyricsLineOffset = Number(data.lyricsLineOffset) || 0;
    currentKey = data.currentKey && KEY_SIGNATURES[data.currentKey] ? data.currentKey : 'C';
    currentClef = data.currentClef === 'treble' ? 'treble' : 'bass';
    currentDuration = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'].includes(data.currentDuration) ? data.currentDuration : 'quarter';

    notes = Array.isArray(data.notes) ? data.notes.map(function (n) {
        return {
            id: n.id != null ? String(n.id) : String(nextNoteId++),
            x: Number(n.x) || 0,
            staffIndex: Math.max(0, Math.min(staffCount - 1, Number(n.staffIndex) || 0)),
            step: Number(n.step),
            y: Number(n.y),
            note: n.note || 'C',
            octave: Number(n.octave),
            duration: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'].includes(n.duration) ? n.duration : 'quarter',
            explicitAccidental: n.explicitAccidental || undefined
        };
    }) : [];

    let maxId = 0;
    notes.forEach(function (n) {
        const num = parseInt(n.id, 10);
        if (!isNaN(num)) maxId = Math.max(maxId, num);
    });
    nextNoteId = maxId + 1;

    noteHistory = [];
    pushHistory();
    selectedNoteId = null;
    hoveredPlacement = null;
    originalNotesBeforeConversion = null;

    const keySelect = document.getElementById('key-select');
    const clefSelect = document.getElementById('clef-select');
    if (keySelect) keySelect.value = currentKey;
    if (clefSelect) clefSelect.value = currentClef;
    setDuration(currentDuration);
    resizeCanvas();
    updateTitleButton();
    updateLyricsButton();
    updateFlatsButtonState();
    redraw();
    return true;
}

function openFromFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
        try {
            const data = JSON.parse(reader.result);
            if (loadState(data)) {
                persistMode = 'always';
                showSaveOpenMessage('Song loaded.');
            } else {
                showSaveOpenMessage('Invalid or unsupported song file.', true);
            }
        } catch (err) {
            showSaveOpenMessage('Could not read file. Use a valid saved song (.json).', true);
        }
    };
    reader.readAsText(file);
}

function downloadSongFile() {
    const state = getStateForSave();
    const name = (sheetTitle && sheetTitle.trim()) ? sheetTitle.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60) : 'sheet-music';
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showSaveOpenMessage('Downloaded. Use Open to load this file later.');
}

function showSaveOpenMessage(text, isError) {
    var el = document.getElementById('save-open-message');
    if (!el) {
        el = document.createElement('div');
        el.id = 'save-open-message';
        el.setAttribute('aria-live', 'polite');
        el.className = 'save-open-message';
        document.querySelector('.toolbar').appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('save-open-message-error', !!isError);
    el.classList.remove('save-open-message-hide');
    clearTimeout(showSaveOpenMessage._tid);
    showSaveOpenMessage._tid = setTimeout(function () {
        el.classList.add('save-open-message-hide');
    }, 4000);
}

function showClearConfirmTooltip() {
    const tooltip = document.getElementById('clear-confirm-tooltip');
    tooltip.classList.remove('hidden');
    tooltip.setAttribute('aria-hidden', 'false');
}

function hideClearConfirmTooltip() {
    const tooltip = document.getElementById('clear-confirm-tooltip');
    tooltip.classList.add('hidden');
    tooltip.setAttribute('aria-hidden', 'true');
}

function yToNearestStaffStep(y) {
    // Default to first staff; prefer using getStaffIndexFromY() and staffStepToY() for accuracy.
    const lines0 = getStaffLines(0);
    return Math.round((lines0[4] - y) / (STAFF_SPACING / 2));
}

function getStaffIndexFromY(y) {
    for (let i = 0; i < staffCount; i++) {
        const top = getStaffTop(i);
        const minY = top - 80;
        const maxY = top + STAFF_SPACING * 4 + 80;
        if (y >= minY && y <= maxY) return i;
    }
    return null;
}

function staffStepToPitch(step) {
    // This app's coordinate system is anchored to the existing position maps:
    // - Treble bottom line corresponds to G2 in TREBLE_NOTE_POSITIONS.
    // - Bass bottom line corresponds to G1 in BASS_NOTE_POSITIONS.
    const startOctave = currentClef === 'bass' ? 1 : 2;
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    // step 0 is the bottom line, which is G in this codebase.
    const startLetterIndex = letters.indexOf('G'); // 4
    const idx = startLetterIndex + step;
    const letter = letters[((idx % 7) + 7) % 7];

    // Octave increases whenever we pass from B -> C.
    // Count how many times the sequence crossed from B to C between 0..step.
    // We can compute octave offset by simulating the diatonic walk.
    let octave = startOctave;
    if (step >= 0) {
        for (let i = 0; i < step; i++) {
            const from = letters[(startLetterIndex + i) % 7];
            const to = letters[(startLetterIndex + i + 1) % 7];
            if (from === 'B' && to === 'C') octave++;
        }
    } else {
        for (let i = 0; i > step; i--) {
            const from = letters[((startLetterIndex + i) % 7 + 7) % 7];
            const to = letters[((startLetterIndex + i - 1) % 7 + 7) % 7];
            if (from === 'C' && to === 'B') octave--;
        }
    }

    return { letter, octave };
}

function applyKeySignatureAccidental(letter) {
    const keySig = KEY_SIGNATURES[currentKey];
    if (!keySig || keySig.type === 'none') return letter;
    if (keySig.type === 'sharp' && keySig.accidentals.includes(letter)) return `${letter}#`;
    if (keySig.type === 'flat' && keySig.accidentals.includes(letter)) return `${letter}b`;
    return letter;
}

function getSnappedXForCanvasX(x) {
    const minX = getKeySignatureWidth();
    const snappedX = Math.round(x / NOTE_COLUMN_WIDTH) * NOTE_COLUMN_WIDTH;
    return Math.max(minX, Math.min(STAFF_WIDTH - 100, snappedX));
}

// True if there is already a note at this column (x) on this staff — only one note per column per staff (left/right only, no stacking).
function isColumnOccupiedOnStaff(snappedX, staffIndex) {
    return notes.some(n => (n.staffIndex ?? 0) === staffIndex && n.x === snappedX);
}

function hitTestNote(canvasX, canvasY) {
    const staffIndex = getStaffIndexFromY(canvasY);
    if (staffIndex === null) return null;
    const snappedX = getSnappedXForCanvasX(canvasX);
    const lines = getStaffLines(staffIndex);
    const step = Math.round((lines[4] - canvasY) / (STAFF_SPACING / 2));
    const y = staffStepToY(step, staffIndex);
    // Find the closest note at this snapped column + step
    const thresholdX = NOTE_WIDTH;
    const thresholdY = NOTE_HEIGHT;
    let best = null;
    let bestScore = Infinity;
    for (const n of notes) {
        if ((n.staffIndex ?? 0) !== staffIndex) continue;
        const dx = Math.abs(n.x - snappedX);
        const dy = Math.abs(staffStepToY(n.step, n.staffIndex ?? 0) - y);
        if (dx <= thresholdX && dy <= thresholdY) {
            const score = dx + dy;
            if (score < bestScore) {
                best = n;
                bestScore = score;
            }
        }
    }
    return best;
}

function updateHoverFromEvent(e) {
    if (draggingLyricsLine) return;
    const { x, y } = canvasCoordsFromEvent(e);
    const staffIndex = getStaffIndexFromY(y);
    if (staffIndex === null) {
        hoveredPlacement = null;
        hoveredNoteId = null;
        canvas.style.cursor = '';
        redraw();
        return;
    }

    // When not in edit mode, hovering over the lyrics line shows drag cursor and no note preview
    if (!isLyricsEditMode && isPointOnLyricsLine(x, y)) {
        hoveredPlacement = null;
        hoveredNoteId = null;
        canvas.style.cursor = 'ns-resize';
        redraw();
        return;
    }
    canvas.style.cursor = '';

    // When lyrics mode is active, we keep note interactions for snapping only (handled elsewhere).
    if (isLyricsEditMode) {
        hoveredPlacement = null;
        hoveredNoteId = null;
        redraw();
        return;
    }

    // Hovering over an existing note shows a pointer cursor and hides the placement preview.
    const hit = hitTestNote(x, y);
    hoveredNoteId = hit ? hit.id : null;
    if (hit) {
        hoveredPlacement = null;
        canvas.style.cursor = draggingNote ? 'grabbing' : 'pointer';
        redraw();
        return;
    }

    const lines = getStaffLines(staffIndex);
    const step = Math.round((lines[4] - y) / (STAFF_SPACING / 2));
    const snappedX = getSnappedXForCanvasX(x);
    if (isColumnOccupiedOnStaff(snappedX, staffIndex)) {
        hoveredPlacement = null;
        hoveredNoteId = null;
        redraw();
        return;
    }
    const pitch = staffStepToPitch(step);
    if (!pitch) {
        hoveredPlacement = null;
        hoveredNoteId = null;
        redraw();
        return;
    }

    const duration = currentDuration;
    hoveredPlacement = {
        x: snappedX,
        staffIndex,
        step,
        y: staffStepToY(step, staffIndex),
        note: applyKeySignatureAccidental(pitch.letter),
        octave: pitch.octave,
        duration
    };
    redraw();
}

canvas.addEventListener('mousemove', updateHoverFromEvent);
canvas.addEventListener('mouseleave', () => {
    hoveredPlacement = null;
    canvas.style.cursor = '';
    redraw();
});

// Set duration from Note shortcut bar or keys 1–5; update hover preview
function setDuration(value) {
    currentDuration = value;
    document.querySelectorAll('.note-type-btn').forEach(btn => {
        btn.classList.toggle('note-type-btn-active', btn.dataset.duration === value);
    });
    if (hoveredPlacement) {
        hoveredPlacement.duration = value;
        redraw();
    }
    schedulePersistSheetToBrowser();
}

// Note shortcut bar (right above staff)
document.querySelectorAll('.note-type-btn').forEach(btn => {
    btn.addEventListener('click', () => setDuration(btn.dataset.duration));
});

// Keyboard shortcuts 1–5 for duration (when not typing in an input)
document.addEventListener('keydown', (e) => {
    if (/^(input|textarea)$/i.test(document.activeElement?.tagName)) return;
    const map = { '1': 'whole', '2': 'half', '3': 'quarter', '4': 'eighth', '5': 'sixteenth' };
    if (map[e.key]) {
        const duration = map[e.key];
        const selected = getSelectedNote ? getSelectedNote() : null;
        if (selected) {
            selected.duration = duration;
            pushHistory();
            redraw();
        } else {
            setDuration(duration);
        }
        e.preventDefault();
    }
});

// Convert mouse position from display coords to canvas (internal) coords (handles scaling)
function canvasCoordsFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// True if (x, y) in canvas coords is inside any staff's lyrics overlay zone (don't snap when clicking in a box).
function isPointInAnyLyricsOverlay(x, y) {
    for (let i = 0; i < staffCount; i++) {
        const r = getLyricsOverlayRect(i);
        if (y >= r.top && y <= r.top + r.height && x >= r.left && x <= r.left + r.width) return true;
    }
    return false;
}

// Lyrics snap: when in lyrics mode, click over a note snaps the cursor in that staff's textarea.
function handleLyricsSnapClick(e) {
    if (!isLyricsEditMode) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const { x, y } = canvasCoordsFromEvent(e);
    if (isPointInAnyLyricsOverlay(x, y)) return;
    const staffIndex = getStaffIndexFromY(y);
    if (staffIndex === null) return;
    const hit = hitTestNote(x, y);
    if (hit) snapLyricsCursorToNote(hit);
}
document.addEventListener('click', handleLyricsSnapClick, true);

// Handle canvas click: in normal mode, place a note; in edit mode, open edit popup
canvas.addEventListener('click', (e) => {
    if (isLyricsEditMode) return; // snap already handled by document capture
    if (suppressNextClick) {
        suppressNextClick = false;
        return;
    }
    const { x, y } = canvasCoordsFromEvent(e);
    if (justFinishedDraggingLyrics) {
        justFinishedDraggingLyrics = false;
        return;
    }
    if (isPointOnLyricsLine(x, y)) return; // don't place a note when clicking the lyrics line
    const staffIndex = getStaffIndexFromY(y);
    if (staffIndex === null) return;

    const hit = hitTestNote(x, y);
    if (hit) {
        selectedNoteId = hit.id;
        redraw();
        return;
    }

    if (!hit && hoveredPlacement) {
        selectedNoteId = null;
        addNoteFromPlacement(hoveredPlacement);
    } else {
        if (selectedNoteId) {
            selectedNoteId = null;
            redraw();
        }
    }
});

function setNoteToKeySignaturePitch(noteObj, step) {
    const pitch = staffStepToPitch(step);
    if (!pitch) return false;
    noteObj.step = step;
    noteObj.y = staffStepToY(step, noteObj.staffIndex ?? 0);
    noteObj.octave = pitch.octave;
    noteObj.note = applyKeySignatureAccidental(pitch.letter);
    noteObj.explicitAccidental = undefined;
    return true;
}

function beginNoteDrag(noteId, canvasY) {
    const n = notes.find(nn => nn.id === noteId);
    if (!n) return;
    selectedNoteId = noteId;
    const staffIndex = n.staffIndex ?? 0;
    const noteY = staffStepToY(n.step, staffIndex);
    draggingNote = {
        noteId,
        staffIndex,
        anchorOffsetY: canvasY - noteY,
        didMove: false
    };
    canvas.style.cursor = 'grabbing';
    redraw();
}

function updateNoteDragFromClientEvent(e) {
    if (!draggingNote) return;
    const { y } = canvasCoordsFromEvent(e);
    const n = notes.find(nn => nn.id === draggingNote.noteId);
    if (!n) return;
    const staffIndex = draggingNote.staffIndex;
    const lines = getStaffLines(staffIndex);
    const targetY = y - draggingNote.anchorOffsetY;
    const step = Math.round((lines[4] - targetY) / (STAFF_SPACING / 2));
    if (typeof step !== 'number') return;
    if (step === n.step) return;
    if (setNoteToKeySignaturePitch(n, step)) {
        draggingNote.didMove = true;
        redraw();
    }
}

function endNoteDrag() {
    if (!draggingNote) return;
    const didMove = draggingNote.didMove;
    draggingNote = null;
    canvas.style.cursor = '';
    if (didMove) {
        pushHistory();
        suppressNextClick = true;
    }
    redraw();
}

canvas.addEventListener('mousedown', (e) => {
    if (isLyricsEditMode) return;
    if (e.button !== 0) return; // left only
    const { x, y } = canvasCoordsFromEvent(e);
    if (justFinishedDraggingLyrics) return;
    const hit = hitTestNote(x, y);
    if (!hit) return;
    e.preventDefault();
    beginNoteDrag(hit.id, y);
});

document.addEventListener('mousemove', (e) => {
    if (!draggingNote) return;
    updateNoteDragFromClientEvent(e);
});

document.addEventListener('mouseup', () => {
    if (!draggingNote) return;
    endNoteDrag();
});

function openNoteEditPopupAtClientPoint(noteId, clientX, clientY) {
    selectedNoteId = noteId;
    if (!noteEditOverlay) return;
    const dialog = noteEditOverlay.querySelector('.note-edit-dialog');
    if (dialog) {
        const pad = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Make visible to measure.
        noteEditOverlay.classList.remove('hidden');
        noteEditOverlay.setAttribute('aria-hidden', 'false');
        const rect = dialog.getBoundingClientRect();
        const w = rect.width || 260;
        const h = rect.height || 160;
        const left = Math.max(pad, Math.min(vw - w - pad, clientX + 10));
        const top = Math.max(pad, Math.min(vh - h - pad, clientY + 10));
        dialog.style.left = left + 'px';
        dialog.style.top = top + 'px';
        return;
    }
    noteEditOverlay.classList.remove('hidden');
    noteEditOverlay.setAttribute('aria-hidden', 'false');
}

canvas.addEventListener('dblclick', (e) => {
    if (isLyricsEditMode) return;
    const { x, y } = canvasCoordsFromEvent(e);
    const hit = hitTestNote(x, y);
    if (!hit) return;
    e.preventDefault();
    openNoteEditPopupAtClientPoint(hit.id, e.clientX, e.clientY);
});

canvas.addEventListener('contextmenu', (e) => {
    if (isLyricsEditMode) return;
    const { x, y } = canvasCoordsFromEvent(e);
    const hit = hitTestNote(x, y);
    if (!hit) return;
    e.preventDefault();
    openNoteEditPopupAtClientPoint(hit.id, e.clientX, e.clientY);
});

// Start dragging the lyrics line when mousedown on the dedicated drag handle (so it's never blocked)
if (lyricsLineDragHandle) {
    lyricsLineDragHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;
        draggingLyricsLine = true;
        lyricsDragStartY = (e.clientY - rect.top) * scaleY;
        lyricsDragStartOffset = lyricsLineOffset;
        lyricsLineDragHandle.classList.add('dragging');
    });
}

document.addEventListener('mousemove', (e) => {
    if (!draggingLyricsLine) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const currentY = (e.clientY - rect.top) * scaleY;
    const delta = currentY - lyricsDragStartY;
    lyricsLineOffset = Math.max(LYRICS_LINE_OFFSET_MIN, Math.min(LYRICS_LINE_OFFSET_MAX, lyricsDragStartOffset + delta));
    redraw();
    if (isLyricsEditMode) positionLyricsOverlay();
    else positionLyricsLineDragHandle();
});

document.addEventListener('mouseup', () => {
    if (draggingLyricsLine) {
        justFinishedDraggingLyrics = true;
        draggingLyricsLine = false;
        if (lyricsLineDragHandle) lyricsLineDragHandle.classList.remove('dragging');
        schedulePersistSheetToBrowser();
    }
});

// Handle clef change
function changeClef() {
    const clefSelect = document.getElementById('clef-select');
    currentClef = clefSelect.value;

    // Clear selection on clef swap (notes will visually shift in this app's system)
    selectedNoteId = null;
    hoveredPlacement = null;
    redraw();
    schedulePersistSheetToBrowser();
}

// Handle key signature change
function changeKey() {
    const keySelect = document.getElementById('key-select');
    currentKey = keySelect.value;
    // Refresh hover preview accidental under the new key
    if (hoveredPlacement) {
        const pitch = staffStepToPitch(hoveredPlacement.step);
        if (pitch) {
            hoveredPlacement.note = applyKeySignatureAccidental(pitch.letter);
        }
    }
    redraw();
    schedulePersistSheetToBrowser();
}

// Handle toolbar buttons
document.getElementById('clear-btn').addEventListener('click', function () {
    showClearConfirmTooltip();
});
document.getElementById('clear-confirm-yes').addEventListener('click', function () {
    clearAll();
    hideClearConfirmTooltip();
});
document.getElementById('clear-confirm-no').addEventListener('click', hideClearConfirmTooltip);
document.addEventListener('click', function (e) {
    const tooltip = document.getElementById('clear-confirm-tooltip');
    const wrapper = document.querySelector('.clear-all-wrapper');
    if (!tooltip.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
        hideClearConfirmTooltip();
    }
});
document.getElementById('clef-select').addEventListener('change', changeClef);
document.getElementById('key-select').addEventListener('change', changeKey);

function exportToPDF() {
    // Render the canvas to an image and print it in a clean window.
    // Users can choose "Save as PDF" in the print dialog.
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    const w = window.open('', '_blank');
    if (!w) {
        alert('Popup blocked. Please allow popups to export to PDF.');
        return;
    }

    w.document.open();
    w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sheet Music Export</title>
    <style>
      @page { margin: 12mm; }
      html, body { height: 100%; }
      body { margin: 0; background: #fff; color: #000; }
      .wrap { display: flex; justify-content: center; padding: 0; }
      img { max-width: 100%; height: auto; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <img src="${dataUrl}" alt="Sheet Music" />
    </div>
    <script>
      window.addEventListener('load', () => {
        window.focus();
        window.print();
        // Close after print dialog (best-effort; some browsers ignore)
        setTimeout(() => window.close(), 250);
      });
    </script>
  </body>
</html>`);
    w.document.close();
}

document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);

// Open / Download (sheet auto-saves to this browser)
document.getElementById('download-btn').addEventListener('click', downloadSongFile);
var openFileInput = document.getElementById('open-file-input');
document.getElementById('open-btn').addEventListener('click', function () {
    if (openFileInput) openFileInput.click();
});
if (openFileInput) {
    openFileInput.addEventListener('change', function () {
        var file = openFileInput.files && openFileInput.files[0];
        if (file) {
            openFromFile(file);
            openFileInput.value = '';
        }
    });
}

function getSelectedNote() {
    if (!selectedNoteId) return null;
    return notes.find(n => n.id === selectedNoteId) || null;
}

function setSelectedAccidental(kind) {
    const n = getSelectedNote();
    if (!n) return;
    const base = n.note.replace('#', '').replace('b', '');
    if (kind === 'sharp') {
        n.note = `${base}#`;
        n.explicitAccidental = 'sharp';
    } else if (kind === 'flat') {
        n.note = `${base}b`;
        n.explicitAccidental = 'flat';
    } else if (kind === 'natural') {
        n.note = base;
        n.explicitAccidental = 'natural';
    }
    pushHistory();
    redraw();
}

function deleteSelectedNote() {
    if (!selectedNoteId) return;
    const idx = notes.findIndex(n => n.id === selectedNoteId);
    if (idx === -1) return;
    notes.splice(idx, 1);
    selectedNoteId = null;
    pushHistory();
    redraw();
}

// Tooltip-based accidental edit flow
const noteEditOverlay = document.getElementById('note-edit-overlay');
const popupSharpBtn = document.getElementById('popup-sharp-btn');
const popupFlatBtn = document.getElementById('popup-flat-btn');
const popupNaturalBtn = document.getElementById('popup-natural-btn');
const popupDeleteBtn = document.getElementById('popup-delete-btn');
const popupCancelBtn = document.getElementById('popup-cancel-btn');
const toggleLyricsBtn = document.getElementById('toggle-lyrics-btn');
const lyricsOverlaysContainer = document.getElementById('lyrics-overlays-container');

function updateLyricsButton() {
    if (!toggleLyricsBtn) return;
    const anyLyrics = lyricsText.trim() !== '';
    if (isLyricsEditMode) {
        toggleLyricsBtn.classList.add('btn-edit-active');
        toggleLyricsBtn.textContent = anyLyrics ? 'Finish Editing Lyrics' : 'Finish Adding Lyrics';
    } else {
        toggleLyricsBtn.classList.remove('btn-edit-active');
        toggleLyricsBtn.textContent = anyLyrics ? 'Edit Lyrics' : 'Add Lyrics';
    }
}

function toggleLyricsMode() {
    isLyricsEditMode = !isLyricsEditMode;
    if (lyricsOverlaysContainer) {
        if (isLyricsEditMode) {
            ensureLyricsOverlays();
            lyricsOverlaysContainer.classList.remove('hidden');
            lyricsOverlaysContainer.setAttribute('aria-hidden', 'false');
            if (lyricsLineDragHandle) {
                lyricsLineDragHandle.classList.add('hidden');
                lyricsLineDragHandle.setAttribute('aria-hidden', 'true');
            }
            const firstTa = getLyricsTextareaForStaff(0);
            if (firstTa) setTimeout(() => firstTa.focus(), 0);
        } else {
            const lines = [];
            for (let i = 0; i < lyricsOverlaysContainer.children.length; i++) {
                const ta = lyricsOverlaysContainer.children[i].querySelector('textarea');
                lines.push(ta ? ta.value : '');
            }
            lyricsText = lines.join('\n');
            lyricsOverlaysContainer.classList.add('hidden');
            lyricsOverlaysContainer.setAttribute('aria-hidden', 'true');
            positionLyricsLineDragHandle();
        }
    }
    updateLyricsButton();
    redraw();
    if (!isLyricsEditMode) {
        schedulePersistSheetToBrowser();
    }
}

function openNoteEditPopup(noteId) {
    selectedNoteId = noteId;
    if (!noteEditOverlay) return;
    noteEditOverlay.classList.remove('hidden');
    noteEditOverlay.setAttribute('aria-hidden', 'false');
}

function closeNoteEditPopup() {
    if (!noteEditOverlay) return;
    noteEditOverlay.classList.add('hidden');
    noteEditOverlay.setAttribute('aria-hidden', 'true');
}

if (toggleLyricsBtn) {
    toggleLyricsBtn.addEventListener('click', toggleLyricsMode);
    // Initialize label on load
    updateLyricsButton();
}

// Attach Enter/Space/Tab handling to a lyrics textarea (one per staff).
function addLyricsTextareaKeydown(ta) {
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!e.shiftKey && isLyricsEditMode) {
                e.preventDefault();
                toggleLyricsMode();
            }
            return;
        }
        if (e.key === ' ') {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const before = ta.value.slice(0, start);
            const after = ta.value.slice(end);
            ta.value = before + ' ' + after;
            ta.selectionStart = ta.selectionEnd = start + 1;
            ta._lastLyricsValue = ta.value;
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const before = ta.value.slice(0, start);
            const after = ta.value.slice(end);
            const tabSpaces = '    ';
            ta.value = before + tabSpaces + after;
            ta.selectionStart = ta.selectionEnd = start + tabSpaces.length;
            return;
        }
    });
}

// Undo browser-inserted period after space (e.g. smart punctuation / autocorrect).
function addLyricsTextareaInputFilter(ta) {
    ta._lastLyricsValue = ta.value;
    ta.addEventListener('input', () => {
        const value = ta.value;
        const prev = ta._lastLyricsValue;
        // If the only change is that a trailing space became ". " (browser inserted period), revert it.
        if (value.length === prev.length + 1 && value.endsWith('. ') && prev.endsWith(' ') && value.slice(0, -2) === prev.slice(0, -1)) {
            ta.value = prev.slice(0, -1) + ' ';
            ta.selectionStart = ta.selectionEnd = ta.value.length;
        }
        ta._lastLyricsValue = ta.value;
    });
    // Store value before any key so we can detect browser-added period in input.
    ta.addEventListener('keydown', () => { ta._lastLyricsValue = ta.value; }, true);
}

if (popupSharpBtn) {
    popupSharpBtn.addEventListener('click', () => {
        setSelectedAccidental('sharp');
        closeNoteEditPopup();
    });
}

if (popupFlatBtn) {
    popupFlatBtn.addEventListener('click', () => {
        setSelectedAccidental('flat');
        closeNoteEditPopup();
    });
}

if (popupNaturalBtn) {
    popupNaturalBtn.addEventListener('click', () => {
        setSelectedAccidental('natural');
        closeNoteEditPopup();
    });
}

if (popupDeleteBtn) {
    popupDeleteBtn.addEventListener('click', () => {
        deleteSelectedNote();
        closeNoteEditPopup();
    });
}

if (popupCancelBtn) {
    popupCancelBtn.addEventListener('click', () => {
        closeNoteEditPopup();
    });
}

// Close popup when clicking on the shaded backdrop (but not the dialog)
if (noteEditOverlay) {
    noteEditOverlay.addEventListener('click', (event) => {
        if (event.target === noteEditOverlay) {
            closeNoteEditPopup();
        }
    });
}

// Keyboard delete/backspace removes selected note (when not typing)
document.addEventListener('keydown', (e) => {
    if (/^(input|textarea)$/i.test(document.activeElement?.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNoteId) {
            e.preventDefault();
            deleteSelectedNote();
        }
    }
});

function addLine() {
    staffCount += 1;
    resizeCanvas();
    hoveredPlacement = null;
    redraw();
    schedulePersistSheetToBrowser();
}

document.getElementById('add-line-btn').addEventListener('click', addLine);

// Title edit dialog (avoid browser prompt; use in-app popup)
const titleEditOverlay = document.getElementById('title-edit-overlay');
const titleEditInput = document.getElementById('title-edit-input');
const titleEditSaveBtn = document.getElementById('title-edit-save-btn');
const titleEditCancelBtn = document.getElementById('title-edit-cancel-btn');

function updateTitleButton() {
    const btn = document.getElementById('add-title-btn');
    if (!btn) return;
    const hasTitle = !!(sheetTitle && sheetTitle.trim());
    btn.textContent = hasTitle ? 'Edit Title' : 'Add Title';
    btn.title = hasTitle ? 'Edit the title of the sheet music' : 'Add a title to the sheet music';
}

function openTitleEditDialog() {
    if (!titleEditOverlay || !titleEditInput) return;
    titleEditInput.value = sheetTitle || '';
    titleEditOverlay.classList.remove('hidden');
    titleEditOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
        titleEditInput.focus();
        titleEditInput.select();
    }, 0);
}

function closeTitleEditDialog() {
    if (!titleEditOverlay) return;
    titleEditOverlay.classList.add('hidden');
    titleEditOverlay.setAttribute('aria-hidden', 'true');
}

function commitTitleEdit() {
    if (!titleEditInput) return;
    sheetTitle = (titleEditInput.value || '').trim();
    updateTitleButton();
    redraw();
    schedulePersistSheetToBrowser();
    closeTitleEditDialog();
}

const addTitleBtn = document.getElementById('add-title-btn');
if (addTitleBtn) {
    addTitleBtn.addEventListener('click', openTitleEditDialog);
    updateTitleButton();
}
if (titleEditSaveBtn) {
    titleEditSaveBtn.addEventListener('click', commitTitleEdit);
}
if (titleEditCancelBtn) {
    titleEditCancelBtn.addEventListener('click', closeTitleEditDialog);
}
if (titleEditOverlay) {
    titleEditOverlay.addEventListener('click', (e) => {
        if (e.target === titleEditOverlay) closeTitleEditDialog();
    });
}
if (titleEditInput) {
    titleEditInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitTitleEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeTitleEditDialog();
        }
    });
}

// Convert sharp note names to flat enharmonic equivalents (e.g. C# -> Db).
// Covers the spellings used in flat keys like Bb, Db, Eb, Ab.
function convertToFlats() {
    // Store original state before conversion
    originalNotesBeforeConversion = JSON.parse(JSON.stringify(notes));

    // Enharmonic: sharp name -> flat (or natural) name (F# is left as F#)
    const sharpToFlat = {
        'C#': 'Db',
        'D#': 'Eb',
        'E#': 'F',
        'G#': 'Ab',
        'A#': 'Bb',
        'B#': 'C'
    };

    let converted = false;
    notes.forEach(note => {
        // Don't touch notes with an explicit natural accidental (they're not sharps)
        if (note.explicitAccidental === 'natural') return;
        const name = note.note;
        if (!name || name.length < 2) return;
        // Match sharp: either '#' (ASCII) or '♯' (Unicode)
        const isSharp = name.charAt(1) === '#' || name.charAt(1) === '\u266F';
        const key = name.charAt(0) + '#';
        const flatName = isSharp ? sharpToFlat[key] : null;
        if (flatName) {
            note.note = flatName;
            note.explicitAccidental = flatName.endsWith('b') ? 'flat' : 'natural';
            // Move staff position up one step so the flat spelling is on the correct line/space
            // (e.g. G# on G line → Ab on A space, not flat on G line which would look like Gb)
            note.step = (note.step ?? 0) + 1;
            // B# → C crosses the octave boundary
            if (key === 'B#') {
                note.octave = (note.octave ?? 2) + 1;
            }
            converted = true;
        }
    });

    if (converted) {
        pushHistory();
        redraw();
        updateFlatsButtonState();
    } else {
        alert('No sharps found to convert (C#, D#, E#, G#, A#, B#). F# is left as-is.');
    }
}

// Revert to original notes before conversion
function revertFlats() {
    if (!originalNotesBeforeConversion) {
        alert('No conversion to revert.');
        return;
    }

    notes = JSON.parse(JSON.stringify(originalNotesBeforeConversion));
    originalNotesBeforeConversion = null;
    pushHistory();
    redraw();
    updateFlatsButtonState();
}

// Update the single Convert/Revert button label and color
function updateFlatsButtonState() {
    const btn = document.getElementById('convert-flats-btn');
    if (!btn) return;
    const isRevertState = originalNotesBeforeConversion !== null;
    if (isRevertState) {
        btn.textContent = 'Revert to Sharps';
        btn.title = 'Revert to original sharp note spellings';
        btn.classList.remove('btn-flats-convert');
        btn.classList.add('btn-revert');
    } else {
        btn.textContent = 'Convert to Flats';
        btn.title = 'Convert sharp notes to flat equivalents (C#→Db, D#→Eb, G#→Ab, A#→Bb, E#→F, B#→C). F# is left as F#.';
        btn.classList.remove('btn-revert');
        btn.classList.add('btn-flats-convert');
    }
}

// Single button: Convert to Flats (green) or Revert to Sharps (blue)
const convertFlatsBtn = document.getElementById('convert-flats-btn');
if (convertFlatsBtn) {
    convertFlatsBtn.addEventListener('click', () => {
        if (originalNotesBeforeConversion !== null) {
            revertFlats();
        } else {
            convertToFlats();
        }
    });
    updateFlatsButtonState();
}

// If a song is on disk already, show Resume/Delete before touching the canvas (avoids wiping the save).
(function runSavedSongStartup() {
    try {
        var raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (!raw) {
            return;
        }
        var data = JSON.parse(raw);
        if (!data || data.version !== SAVE_VERSION) {
            return;
        }
        savedSongData = data;
        var overlay = document.getElementById('saved-song-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }
    } catch (e) { /* ignore */ }
})();

// Initialize history so undo works from first action
pushHistory();

// Initial draw
redraw();

var savedSongOverlay = document.getElementById('saved-song-overlay');

function hideSavedSongPopup() {
    savedSongData = null;
    if (savedSongOverlay) {
        savedSongOverlay.classList.add('hidden');
        savedSongOverlay.setAttribute('aria-hidden', 'true');
    }
}

document.getElementById('saved-song-resume-btn').addEventListener('click', function () {
    if (!savedSongData) return;
    var data = savedSongData;
    savedSongData = null;
    persistMode = 'always';
    hideSavedSongPopup();
    loadState(data);
});

document.getElementById('saved-song-delete-btn').addEventListener('click', function () {
    try {
        localStorage.removeItem(SAVE_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    persistMode = 'content_only';
    hideSavedSongPopup();
});

window.addEventListener('beforeunload', function () {
    persistSheetToBrowserNow();
});
window.addEventListener('pagehide', function () {
    persistSheetToBrowserNow();
});
