// Sheet Music Creator
const canvas = document.getElementById('sheet-music-canvas');
const ctx = canvas.getContext('2d');

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
let isEditMode = false;

// Store title
let sheetTitle = '';

// Hover preview + selection state
let hoveredPlacement = null; // { x, staffIndex, step, y, note, octave, duration }
let selectedNoteId = null;
let nextNoteId = 1;

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

// Draw lyrics text under the first staff (free-form block with user spacing).
// When in lyrics edit mode we don't draw—the overlay textarea is shown instead.
function drawLyricsForStaff(staffIndex) {
    if (staffIndex !== 0 || isLyricsEditMode) return;
    if (!lyricsText || lyricsText.trim() === '') return;
    const startY = getLyricsBaselineY(0);
    const lineHeight = 20;
    const lines = lyricsText.split('\n');
    if (lines.length === 0) return;
    ctx.save();
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const leftX = getKeySignatureWidth() + 10;
    lines.forEach((line, i) => {
        ctx.fillText(line, leftX, startY + i * lineHeight);
    });
    ctx.restore();
}

// Bounds (in canvas pixels) for the lyrics zone under the first staff
function getLyricsOverlayRect() {
    const baselineY = getLyricsBaselineY(0);
    const top = baselineY - STAFF_SPACING * 0.7;
    const left = getKeySignatureWidth() + 8;
    const width = STAFF_WIDTH - left - 24;
    const height = 88;
    return { left, top, width, height };
}

// Hit test for the draggable lyrics line (staff 0 only). Used for drag and cursor.
const LYRICS_LINE_DRAG_THRESHOLD = 12;
function isPointOnLyricsLine(x, y) {
    const baselineY = getLyricsBaselineY(0);
    if (y < baselineY - LYRICS_LINE_DRAG_THRESHOLD || y > baselineY + LYRICS_LINE_DRAG_THRESHOLD) return false;
    return x >= 50 && x <= STAFF_WIDTH - 50;
}

function positionLyricsOverlay() {
    if (!lyricsOverlay || !lyricsTextarea) return;
    const r = getLyricsOverlayRect();
    lyricsOverlay.style.left = r.left + 'px';
    lyricsOverlay.style.top = r.top + 'px';
    lyricsOverlay.style.width = r.width + 'px';
    lyricsOverlay.style.height = r.height + 'px';
}

// Measure text width using a hidden span; copy textarea's computed font so it matches exactly.
let _measureSpan = null;
function getTextWidth(text) {
    if (!_measureSpan) {
        _measureSpan = document.createElement('span');
        _measureSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
        document.body.appendChild(_measureSpan);
    }
    if (lyricsTextarea) {
        const s = window.getComputedStyle(lyricsTextarea);
        _measureSpan.style.font = s.font;
        _measureSpan.style.letterSpacing = s.letterSpacing;
    }
    _measureSpan.textContent = text;
    return _measureSpan.getBoundingClientRect().width;
}

// Compute distance (CSS px) from textarea text start to the note, and current first-line width.
function getNoteOffsetAndLineWidth(noteX) {
    const canvasRect = canvas.getBoundingClientRect();
    const textareaRect = lyricsTextarea.getBoundingClientRect();
    const scale = canvasRect.width / canvas.width;
    const style = window.getComputedStyle(lyricsTextarea);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const noteXViewport = canvasRect.left + noteX * scale;
    const textStartX = textareaRect.left + paddingLeft;
    const relXCss = noteXViewport - textStartX;
    const text = lyricsTextarea.value;
    const firstNewline = text.indexOf('\n');
    const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
    const lineWidth = getTextWidth(firstLine);
    return { relXCss, firstLine, firstNewline, text, lineWidth };
}

// Snap cursor under the note. If the note is to the right of the current text, insert spaces
// so the cursor can sit in empty space under the note (like tabbing/spacing manually).
function snapLyricsCursorToNote(note) {
    if (!lyricsTextarea) return;
    const { relXCss, firstLine, firstNewline, text, lineWidth } = getNoteOffsetAndLineWidth(note.x);
    if (relXCss <= 0) {
        lyricsTextarea.setSelectionRange(0, 0);
        lyricsTextarea.focus();
        return;
    }

    let newValue = text;
    let cursorPos;

    if (relXCss > lineWidth) {
        // Note is to the right of the text – insert spaces so the caret can sit under the note
        const spaceWidth = getTextWidth(' ');
        const needWidth = relXCss - lineWidth;
        let numSpaces = spaceWidth > 0 ? Math.max(0, Math.ceil(needWidth / spaceWidth)) : 0;
        numSpaces = Math.max(0, numSpaces - 5); // align slightly left of note (about 5 spaces)
        const spaces = ' '.repeat(numSpaces);
        if (firstNewline === -1) {
            newValue = firstLine + spaces;
            cursorPos = firstLine.length + numSpaces;
        } else {
            newValue = firstLine + spaces + '\n' + text.slice(firstNewline + 1);
            cursorPos = firstLine.length + numSpaces;
        }
        lyricsTextarea.value = newValue;
    } else {
        // Note is within the current line – find character index
        let i = 0;
        while (i <= firstLine.length) {
            if (getTextWidth(firstLine.slice(0, i)) <= relXCss) i++;
            else break;
        }
        cursorPos = Math.min(i, firstLine.length);
    }

    const safeIdx = Math.max(0, Math.min(cursorPos, lyricsTextarea.value.length));
    const applySelection = () => {
        lyricsTextarea.setSelectionRange(safeIdx, safeIdx);
        lyricsTextarea.focus();
    };
    setTimeout(applySelection, 0);
    setTimeout(applySelection, 100);
}

// Draw a note
function drawNote(x, staffIndex, step, note, octave, duration, isSelected = false, isPreview = false) {
    const noteKey = getNoteKey(note, octave);
    const STAFF_LINES = getStaffLines(staffIndex);
    const noteY = staffStepToY(step, staffIndex);
    
    // Draw note head: whole note = thick black oval with white hollow; half = stroke-only hollow; quarter and shorter = filled
    const isHollow = duration === 'whole' || duration === 'half';
    const strokeColor = isSelected ? '#1f5fbf' : '#000';
    const fillColor = isSelected ? '#1f5fbf' : '#000';

    ctx.beginPath();
    ctx.ellipse(x, noteY, NOTE_WIDTH / 2, NOTE_HEIGHT / 2, 0, 0, 2 * Math.PI);
    if (duration === 'whole') {
        // Whole note: thick black oval with clear white hollow (match reference exactly)
        ctx.fillStyle = isSelected ? '#1f5fbf' : '#000';
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

    if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#1f5fbf';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, noteY, NOTE_WIDTH / 2 + 4, NOTE_HEIGHT / 2 + 4, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    } else if (isPreview) {
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.ellipse(x, noteY, NOTE_WIDTH / 2 + 3, NOTE_HEIGHT / 2 + 3, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    
    // Draw stem if not whole note
    if (duration !== 'whole') {
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
        // Treat adjacent snapped columns as beam neighbors.
        // Threshold slightly under 2 columns so beams still connect nicely
        // even if spacing changes.
        if (dx <= NOTE_COLUMN_WIDTH * 1.5) {
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
    
    // Draw all notes
    notes.forEach(note => {
        drawNote(note.x, note.staffIndex ?? 0, note.step, note.note, note.octave, note.duration, note.id === selectedNoteId);
    });

    // Draw lyrics text after notes so they sit cleanly under the staff
    for (let i = 0; i < staffCount; i++) {
        drawLyricsForStaff(i);
    }

    // Beam runs of adjacent 8th/16th notes (and draw flags for remaining unbeamed notes)
    // Only compute beams within the same staff system
    const groups = [];
    for (let i = 0; i < staffCount; i++) {
        const inStaff = notes.filter(n => (n.staffIndex ?? 0) === i);
        groups.push(...computeBeamGroups(inStaff));
    }
    const beamedIds = new Set();
    for (const g of groups) for (const n of g) beamedIds.add(n.id);
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
}

// Clear all notes (called after user confirms in tooltip)
function clearAll() {
    notes = [];
    noteHistory = [];
    selectedNoteId = null;
    hoveredPlacement = null;
    redraw();
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

// Undo last note
function undo() {
    if (noteHistory.length === 0) return;
    noteHistory.pop(); // remove current snapshot
    const prev = noteHistory[noteHistory.length - 1];
    notes = prev ? JSON.parse(JSON.stringify(prev)) : [];
    if (selectedNoteId && !notes.some(n => n.id === selectedNoteId)) {
        selectedNoteId = null;
    }
    redraw();
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
        canvas.style.cursor = '';
        redraw();
        return;
    }

    // When not in edit mode, hovering over the lyrics line shows drag cursor and no note preview
    if (!isEditMode && !isLyricsEditMode && isPointOnLyricsLine(x, y)) {
        hoveredPlacement = null;
        canvas.style.cursor = 'ns-resize';
        redraw();
        return;
    }
    canvas.style.cursor = '';

    // In edit modes, we don't show a placement preview; instead, highlight
    // the note under the cursor (if any) for a clear visual target.
    if (isEditMode || isLyricsEditMode) {
        hoveredPlacement = null;
        const hit = hitTestNote(x, y);
        const newSelectedId = hit ? hit.id : null;
        if (newSelectedId !== selectedNoteId) {
            selectedNoteId = newSelectedId;
            redraw();
        }
        return;
    }

    const lines = getStaffLines(staffIndex);
    const step = Math.round((lines[4] - y) / (STAFF_SPACING / 2));
    const snappedX = getSnappedXForCanvasX(x);
    const pitch = staffStepToPitch(step);
    if (!pitch) {
        hoveredPlacement = null;
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
        setDuration(map[e.key]);
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

// Lyrics snap: when in lyrics mode, any click whose *position* is over a note on the staff
// snaps the cursor. Use document capture so we see it even when the event target is the textarea.
function handleLyricsSnapClick(e) {
    if (!isLyricsEditMode) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const { x, y } = canvasCoordsFromEvent(e);
    const lyricsRect = getLyricsOverlayRect();
    if (y >= lyricsRect.top) return;
    const staffIndex = getStaffIndexFromY(y);
    if (staffIndex === null) return;
    const hit = hitTestNote(x, y);
    if (hit && (hit.staffIndex ?? 0) === 0) {
        // Don't preventDefault/stopPropagation – let the textarea lose focus so when we
        // focus it again and setSelectionRange, the browser doesn't restore the old cursor.
        snapLyricsCursorToNote(hit);
    }
}
document.addEventListener('click', handleLyricsSnapClick, true);

// Handle canvas click: in normal mode, place a note; in edit mode, open edit popup
canvas.addEventListener('click', (e) => {
    if (isLyricsEditMode) return; // snap already handled by document capture
    const { x, y } = canvasCoordsFromEvent(e);
    if (justFinishedDraggingLyrics) {
        justFinishedDraggingLyrics = false;
        return;
    }
    if (!isEditMode && isPointOnLyricsLine(x, y)) return; // don't place a note when clicking the lyrics line
    const staffIndex = getStaffIndexFromY(y);
    if (staffIndex === null) return;

    const hit = hitTestNote(x, y);
    if (isEditMode) {
        if (hit) {
            openNoteEditPopup(hit.id);
        }
        return;
    }

    if (!hit && hoveredPlacement) {
        selectedNoteId = null;
        addNoteFromPlacement(hoveredPlacement);
    }
});

// Start dragging the lyrics line (staff 0) when mousedown on the dashed line
canvas.addEventListener('mousedown', (e) => {
    if (isLyricsEditMode) return;
    const { x, y } = canvasCoordsFromEvent(e);
    if (!isPointOnLyricsLine(x, y)) return;
    e.preventDefault();
    draggingLyricsLine = true;
    lyricsDragStartY = y;
    lyricsDragStartOffset = lyricsLineOffset;
});

document.addEventListener('mousemove', (e) => {
    if (!draggingLyricsLine) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const currentY = (e.clientY - rect.top) * scaleY;
    const delta = currentY - lyricsDragStartY;
    lyricsLineOffset = Math.max(LYRICS_LINE_OFFSET_MIN, Math.min(LYRICS_LINE_OFFSET_MAX, lyricsDragStartOffset + delta));
    redraw();
    if (isLyricsEditMode) positionLyricsOverlay();
});

document.addEventListener('mouseup', () => {
    if (draggingLyricsLine) {
        justFinishedDraggingLyrics = true;
        draggingLyricsLine = false;
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
document.getElementById('undo-btn').addEventListener('click', undo);
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

// Popup-based edit flow
const editModeBtn = document.getElementById('edit-mode-btn');
const noteEditOverlay = document.getElementById('note-edit-overlay');
const popupSharpBtn = document.getElementById('popup-sharp-btn');
const popupFlatBtn = document.getElementById('popup-flat-btn');
const popupNaturalBtn = document.getElementById('popup-natural-btn');
const popupDeleteBtn = document.getElementById('popup-delete-btn');
const popupCancelBtn = document.getElementById('popup-cancel-btn');
const toggleLyricsBtn = document.getElementById('toggle-lyrics-btn');
const lyricsOverlay = document.getElementById('lyrics-overlay');
const lyricsTextarea = document.getElementById('lyrics-textarea');

function updateEditModeButton() {
    if (!editModeBtn) return;
    if (isEditMode) {
        editModeBtn.classList.add('btn-edit-active');
        editModeBtn.textContent = 'Finish Editing';
    } else {
        editModeBtn.classList.remove('btn-edit-active');
        editModeBtn.textContent = 'Edit Note';
    }
}

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
    if (lyricsOverlay && lyricsTextarea) {
        if (isLyricsEditMode) {
            lyricsTextarea.value = lyricsText;
            positionLyricsOverlay();
            lyricsOverlay.classList.remove('hidden');
            lyricsOverlay.setAttribute('aria-hidden', 'false');
            setTimeout(() => lyricsTextarea.focus(), 0);
        } else {
            lyricsText = lyricsTextarea.value;
            lyricsOverlay.classList.add('hidden');
            lyricsOverlay.setAttribute('aria-hidden', 'true');
        }
    }
    updateLyricsButton();
    redraw();
}

function toggleEditMode() {
    isEditMode = !isEditMode;
    updateEditModeButton();
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

if (editModeBtn) {
    editModeBtn.addEventListener('click', toggleEditMode);
}

if (toggleLyricsBtn) {
    toggleLyricsBtn.addEventListener('click', toggleLyricsMode);
    // Initialize label on load
    updateLyricsButton();
}

// Enter (without Shift) finishes adding lyrics; Shift+Enter inserts a newline.
// Tab inserts a large space instead of moving focus.
if (lyricsTextarea) {
    lyricsTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!e.shiftKey && isLyricsEditMode) {
                e.preventDefault();
                toggleLyricsMode();
            }
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = lyricsTextarea.selectionStart;
            const end = lyricsTextarea.selectionEnd;
            const before = lyricsTextarea.value.slice(0, start);
            const after = lyricsTextarea.value.slice(end);
            const tabSpaces = '    '; // large space
            lyricsTextarea.value = before + tabSpaces + after;
            lyricsTextarea.selectionStart = lyricsTextarea.selectionEnd = start + tabSpaces.length;
            return;
        }
    });
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

function addLine() {
    staffCount += 1;
    resizeCanvas();
    hoveredPlacement = null;
    redraw();
}

document.getElementById('add-line-btn').addEventListener('click', addLine);

// Handle add title button
function addTitle() {
    const currentTitle = sheetTitle || '';
    const newTitle = prompt('Enter the title for your sheet music:', currentTitle);
    if (newTitle !== null) {
        sheetTitle = newTitle.trim();
        redraw();
    }
}

document.getElementById('add-title-btn').addEventListener('click', addTitle);

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

// Initialize history so undo works from first action
pushHistory();

// Initial draw
redraw();
