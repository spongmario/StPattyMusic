// Sheet Music Creator
const canvas = document.getElementById('sheet-music-canvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions
const STAFF_HEIGHT = 400;
const STAFF_WIDTH = 1200;
const STAFF_TOP = 100;
const STAFF_SPACING = 20; // Space between staff lines
const NOTE_WIDTH = 30;
const NOTE_HEIGHT = 20;

// Staff line positions (5 lines per staff)
const STAFF_LINES = [0, 1, 2, 3, 4].map(i => STAFF_TOP + i * STAFF_SPACING);

// Note positions (MIDI note to staff position mapping)
// C4 (middle C) is typically on the first ledger line below the staff
const NOTE_POSITIONS = {
    // Octave 3
    'C3': STAFF_LINES[4] + STAFF_SPACING * 2,
    'D3': STAFF_LINES[4] + STAFF_SPACING * 1.5,
    'E3': STAFF_LINES[4] + STAFF_SPACING,
    'F3': STAFF_LINES[4] + STAFF_SPACING * 0.5,
    'G3': STAFF_LINES[4],
    'A3': STAFF_LINES[3] + STAFF_SPACING * 0.5,
    'B3': STAFF_LINES[3],
    // Octave 4
    'C4': STAFF_LINES[2] + STAFF_SPACING * 0.5,
    'D4': STAFF_LINES[2],
    'E4': STAFF_LINES[1] + STAFF_SPACING * 0.5,
    'F4': STAFF_LINES[1],
    'G4': STAFF_LINES[0] + STAFF_SPACING * 0.5,
    'A4': STAFF_LINES[0],
    'B4': STAFF_LINES[0] - STAFF_SPACING * 0.5,
    // Octave 5
    'C5': STAFF_LINES[0] - STAFF_SPACING,
    'D5': STAFF_LINES[0] - STAFF_SPACING * 1.5,
    'E5': STAFF_LINES[0] - STAFF_SPACING * 2,
    'F5': STAFF_LINES[0] - STAFF_SPACING * 2.5,
    'G5': STAFF_LINES[0] - STAFF_SPACING * 3,
    'A5': STAFF_LINES[0] - STAFF_SPACING * 3.5,
    'B5': STAFF_LINES[0] - STAFF_SPACING * 4,
    // Octave 6
    'C6': STAFF_LINES[0] - STAFF_SPACING * 4.5,
    'D6': STAFF_LINES[0] - STAFF_SPACING * 5,
    'E6': STAFF_LINES[0] - STAFF_SPACING * 5.5,
    'F6': STAFF_LINES[0] - STAFF_SPACING * 6,
    'G6': STAFF_LINES[0] - STAFF_SPACING * 6.5,
    'A6': STAFF_LINES[0] - STAFF_SPACING * 7,
    'B6': STAFF_LINES[0] - STAFF_SPACING * 7.5,
};

// Sharps and flats
const SHARP_POSITIONS = {
    'C#': 'C', 'D#': 'D', 'F#': 'F', 'G#': 'G', 'A#': 'A'
};

// Store notes
let notes = [];
let noteHistory = [];

// Set canvas size
canvas.width = STAFF_WIDTH;
canvas.height = STAFF_HEIGHT;

// Get note key (e.g., "C4", "C#4")
function getNoteKey(note, octave) {
    return note + octave;
}

// Get Y position for a note
function getNoteYPosition(note, octave) {
    const noteKey = getNoteKey(note, octave);
    return NOTE_POSITIONS[noteKey] || STAFF_LINES[2];
}

// Draw staff lines
function drawStaff() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    
    // Draw 5 staff lines
    STAFF_LINES.forEach((y, index) => {
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(STAFF_WIDTH - 50, y);
        ctx.stroke();
    });
    
    // Draw clef (treble clef symbol - simplified)
    ctx.font = '60px serif';
    ctx.fillStyle = '#333';
    ctx.fillText('𝄞', 60, STAFF_LINES[0] + 20);
}

// Draw a note
function drawNote(x, y, note, octave, duration) {
    const noteKey = getNoteKey(note, octave);
    const noteY = getNoteYPosition(note, octave);
    
    // Draw note head
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, noteY, NOTE_WIDTH / 2, NOTE_HEIGHT / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw stem if not whole note
    if (duration !== 'whole') {
        const stemLength = duration === 'half' ? 60 : 80;
        const stemX = x + NOTE_WIDTH / 2;
        const stemStartY = noteY - (noteY > STAFF_LINES[2] ? 0 : stemLength);
        const stemEndY = noteY - (noteY > STAFF_LINES[2] ? stemLength : 0);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stemX, stemStartY);
        ctx.lineTo(stemX, stemEndY);
        ctx.stroke();
        
        // Draw flag for eighth and sixteenth notes
        if (duration === 'eighth' || duration === 'sixteenth') {
            const flagY = stemStartY;
            ctx.beginPath();
            ctx.moveTo(stemX, flagY);
            ctx.quadraticCurveTo(stemX + 10, flagY - 10, stemX + 15, flagY - 5);
            ctx.stroke();
            
            if (duration === 'sixteenth') {
                ctx.beginPath();
                ctx.moveTo(stemX, flagY - 15);
                ctx.quadraticCurveTo(stemX + 10, flagY - 25, stemX + 15, flagY - 20);
                ctx.stroke();
            }
        }
    }
    
    // Draw sharp/flat if needed
    if (note.includes('#')) {
        ctx.font = '24px serif';
        ctx.fillText('♯', x - 25, noteY + 8);
    } else if (note.includes('b')) {
        ctx.font = '24px serif';
        ctx.fillText('♭', x - 25, noteY + 8);
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

// Redraw everything
function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStaff();
    
    // Draw all notes
    notes.forEach(note => {
        drawNote(note.x, note.y, note.note, note.octave, note.duration);
    });
}

// Add note at position
function addNote(x, y) {
    const noteSelect = document.getElementById('note-select');
    const octaveSelect = document.getElementById('octave-select');
    const durationSelect = document.getElementById('duration-select');
    
    const note = noteSelect.value;
    const octave = octaveSelect.value;
    const duration = durationSelect.value;
    
    // Snap to grid (every 50 pixels)
    const snappedX = Math.round(x / 50) * 50;
    const snappedXClamped = Math.max(100, Math.min(STAFF_WIDTH - 100, snappedX));
    
    notes.push({
        x: snappedXClamped,
        y: y,
        note: note,
        octave: octave,
        duration: duration
    });
    
    noteHistory.push([...notes]);
    redraw();
}

// Clear all notes
function clearAll() {
    if (confirm('Are you sure you want to clear all notes?')) {
        notes = [];
        noteHistory = [];
        redraw();
    }
}

// Undo last note
function undo() {
    if (notes.length > 0) {
        notes.pop();
        if (noteHistory.length > 0) {
            noteHistory.pop();
        }
        redraw();
    }
}

// Handle canvas click
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Only add notes if clicking in the staff area
    if (y >= STAFF_TOP - 50 && y <= STAFF_TOP + STAFF_SPACING * 4 + 50) {
        addNote(x, y);
    }
});

// Handle toolbar buttons
document.getElementById('clear-btn').addEventListener('click', clearAll);
document.getElementById('undo-btn').addEventListener('click', undo);

// Initial draw
redraw();
