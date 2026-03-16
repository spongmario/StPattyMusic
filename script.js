// Piano configuration
const OCTAVES = 2; // Number of octaves to display
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Key definitions (major and minor scales)
const KEY_SCALES = {
    // Major keys
    'C': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    'C#': ['C#', 'D#', 'F', 'F#', 'G#', 'A#', 'C'],
    'D': ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
    'D#': ['D#', 'F', 'G', 'G#', 'A#', 'C', 'D'],
    'E': ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
    'F': ['F', 'G', 'A', 'A#', 'C', 'D', 'E'],
    'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F'],
    'G': ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
    'G#': ['G#', 'A#', 'C', 'C#', 'D#', 'F', 'G'],
    'A': ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
    'A#': ['A#', 'C', 'D', 'D#', 'F', 'G', 'A'],
    'B': ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
    // Minor keys
    'Cm': ['C', 'D', 'D#', 'F', 'G', 'G#', 'A#'],
    'C#m': ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B'],
    'Dm': ['D', 'E', 'F', 'G', 'A', 'A#', 'C'],
    'D#m': ['D#', 'F', 'F#', 'G#', 'A#', 'B', 'C#'],
    'Em': ['E', 'F#', 'G', 'A', 'B', 'C', 'D'],
    'Fm': ['F', 'G', 'G#', 'A#', 'C', 'C#', 'D#'],
    'F#m': ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E'],
    'Gm': ['G', 'A', 'A#', 'C', 'D', 'D#', 'F'],
    'G#m': ['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F#'],
    'Am': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'A#m': ['A#', 'C', 'C#', 'D#', 'F', 'F#', 'G#'],
    'Bm': ['B', 'C#', 'D', 'E', 'F#', 'G', 'A']
};

// Audio context for sound generation
let audioContext;
let currentKey = null;

// Initialize audio context
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.error('Web Audio API not supported');
    }
}

// Generate piano sound using Web Audio API
function playNote(note, octave) {
    if (!audioContext) {
        initAudio();
    }
    
    // Frequency calculation (A4 = 440Hz)
    const noteFrequencies = {
        'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
        'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
        'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
    };
    
    const baseFreq = noteFrequencies[note] || 440;
    const frequency = baseFreq * Math.pow(2, octave - 4);
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    // Envelope for piano-like sound
    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    oscillator.start(now);
    oscillator.stop(now + 0.5);
}

// Create piano keys
function createPiano() {
    const piano = document.getElementById('piano');
    piano.innerHTML = '';
    
    const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    let whiteKeyIndex = 0;
    
    // First, create all white keys
    for (let octave = 3; octave < 3 + OCTAVES; octave++) {
        whiteKeys.forEach((note) => {
            const keyElement = document.createElement('div');
            keyElement.className = 'piano-key white-key';
            keyElement.dataset.note = note;
            keyElement.dataset.octave = octave;
            
            const label = document.createElement('div');
            label.className = 'key-label';
            label.textContent = note;
            keyElement.appendChild(label);
            
            keyElement.addEventListener('mousedown', () => {
                keyElement.classList.add('active');
                playNote(note, octave);
            });
            
            keyElement.addEventListener('mouseup', () => {
                keyElement.classList.remove('active');
            });
            
            keyElement.addEventListener('mouseleave', () => {
                keyElement.classList.remove('active');
            });
            
            piano.appendChild(keyElement);
            whiteKeyIndex++;
        });
    }
    
    // Then, create all black keys positioned absolutely
    // We need to position them relative to the white keys
    whiteKeyIndex = 0;
    for (let octave = 3; octave < 3 + OCTAVES; octave++) {
        whiteKeys.forEach((note) => {
            // Add black keys between certain white keys
            if (note === 'C' || note === 'D' || note === 'F' || note === 'G' || note === 'A') {
                const blackNote = note === 'C' ? 'C#' : note === 'D' ? 'D#' : note === 'F' ? 'F#' : note === 'G' ? 'G#' : 'A#';
                
                const blackKey = document.createElement('div');
                blackKey.className = 'piano-key black-key';
                blackKey.dataset.note = blackNote;
                blackKey.dataset.octave = octave;
                
                // Calculate position: each white key is 60px wide, black key is 40px wide
                // Black keys should be centered between white keys
                // To center a 40px black key between two 60px white keys:
                // - First white key ends at (whiteKeyIndex * 60) + 60
                // - Center point is at (whiteKeyIndex * 60) + 60
                // - Black key left edge = center - half width = 60 - 20 = 40
                // So: (whiteKeyIndex * 60) + 40
                const leftPosition = (whiteKeyIndex * 60) + 40;
                blackKey.style.left = `${leftPosition}px`;
                
                const blackLabel = document.createElement('div');
                blackLabel.className = 'key-label';
                blackLabel.textContent = blackNote;
                blackKey.appendChild(blackLabel);
                
                blackKey.addEventListener('mousedown', () => {
                    blackKey.classList.add('active');
                    playNote(blackNote, octave);
                });
                
                blackKey.addEventListener('mouseup', () => {
                    blackKey.classList.remove('active');
                });
                
                blackKey.addEventListener('mouseleave', () => {
                    blackKey.classList.remove('active');
                });
                
                piano.appendChild(blackKey);
            }
            whiteKeyIndex++;
        });
    }
}

// Highlight keys in the selected scale
function highlightKeysInScale(keyName) {
    // Remove all highlights
    document.querySelectorAll('.piano-key').forEach(key => {
        key.classList.remove('in-key');
    });
    
    if (!keyName || !KEY_SCALES[keyName]) {
        return;
    }
    
    const scaleNotes = KEY_SCALES[keyName];
    
    // Highlight all keys that match the scale notes
    document.querySelectorAll('.piano-key').forEach(key => {
        const note = key.dataset.note;
        if (scaleNotes.includes(note)) {
            key.classList.add('in-key');
        }
    });
}

// Handle key selection
function selectKey(keyName) {
    // If clicking the same key again, deselect it
    if (currentKey === keyName) {
        currentKey = null;
        
        // Remove active state from all buttons
        document.querySelectorAll('.key-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Reset display
        const selectedKeyText = document.getElementById('selected-key-text');
        const keyNotesText = document.getElementById('key-notes-text');
        selectedKeyText.textContent = 'No key selected';
        keyNotesText.textContent = '';
        
        // Remove all highlights
        document.querySelectorAll('.piano-key').forEach(key => {
            key.classList.remove('in-key');
        });
        
        return;
    }
    
    // Otherwise, select the new key
    currentKey = keyName;
    
    // Update button states
    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.key === keyName) {
            btn.classList.add('active');
        }
    });
    
    // Update display
    const selectedKeyText = document.getElementById('selected-key-text');
    const keyNotesText = document.getElementById('key-notes-text');
    
    const isMinor = keyName.endsWith('m');
    const displayName = isMinor ? keyName.replace('m', ' Minor') : keyName + ' Major';
    selectedKeyText.textContent = `Selected Key: ${displayName}`;
    
    const scaleNotes = KEY_SCALES[keyName] || [];
    // Filter to only show sharps and flats (notes with # or b), not natural notes
    const sharpsFlats = scaleNotes.filter(note => note.includes('#') || note.includes('b'));
    if (sharpsFlats.length > 0) {
        keyNotesText.textContent = `Notes in key: ${sharpsFlats.join(', ')}`;
    } else {
        keyNotesText.textContent = `Notes in key: (all natural notes)`;
    }
    
    // Highlight keys
    highlightKeysInScale(keyName);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initAudio();
    createPiano();
    
    // Add event listeners to key buttons
    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectKey(btn.dataset.key);
        });
    });
    
    // Enable audio context on first user interaction
    document.addEventListener('click', () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }, { once: true });
});
