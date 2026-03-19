// Piano configuration
// Range is inclusive and uses scientific pitch notation (e.g. A2, C#4).
// Extended a few keys on each end from the previous C3→B4 range.
const PIANO_RANGE = {
    start: { note: 'A', octave: 2 }, // A2 (adds A2, A#2, B2)
    end: { note: 'D', octave: 5 }    // D5 (removes the top D#5 and E5)
};

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_TO_SEMITONE = NOTES.reduce((acc, n, i) => {
    acc[n] = i;
    return acc;
}, {});

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

function getCssPxVar(varName, fallbackPx) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallbackPx;
}

function noteToMidi(note, octave) {
    const semitone = NOTE_TO_SEMITONE[note];
    if (semitone == null) return null;
    // MIDI: C-1 = 0, C4 = 60 -> (octave + 1) * 12
    return (octave + 1) * 12 + semitone;
}

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
    
    const now = audioContext.currentTime;
    const duration = 2.0; // Longer duration for realistic piano decay
    
    // Create master gain and low-pass filter for warmth
    const masterGain = audioContext.createGain();
    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 8000; // Cut off high frequencies for warmth
    lowPass.Q.value = 1;
    
    lowPass.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    // Add hammer strike noise (brief burst of filtered noise)
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.01, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
    }
    const noiseSource = audioContext.createBufferSource();
    const noiseGain = audioContext.createGain();
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = frequency * 3; // Center around higher harmonics
    noiseFilter.Q.value = 2;
    
    noiseSource.buffer = noiseBuffer;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(lowPass);
    
    // Quick noise burst envelope
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    noiseSource.start(now);
    noiseSource.stop(now + 0.01);
    
    // Realistic piano harmonic series with proper amplitudes
    // Based on actual piano string physics
    const harmonics = [
        { freq: 1.0, gain: 1.0, detune: 0 },      // Fundamental
        { freq: 2.0, gain: 0.6, detune: 0.002 },  // Octave
        { freq: 3.0, gain: 0.4, detune: 0.003 },  // Perfect fifth
        { freq: 4.0, gain: 0.25, detune: 0.004 }, // Two octaves
        { freq: 5.0, gain: 0.15, detune: 0.005 }, // Major third
        { freq: 6.0, gain: 0.1, detune: 0.006 },  // Perfect fifth + octave
        { freq: 7.0, gain: 0.08, detune: 0.007 }, // Seventh harmonic
        { freq: 8.0, gain: 0.05, detune: 0.008 }  // Three octaves
    ];
    
    // Create oscillators for each harmonic
    harmonics.forEach((harmonic, index) => {
        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const harmonicFilter = audioContext.createBiquadFilter();
        
        // Use sawtooth for richer harmonics, but filter it
        osc.type = 'sawtooth';
        osc.frequency.value = frequency * harmonic.freq * (1 + harmonic.detune);
        
        // Filter each harmonic differently for realism
        harmonicFilter.type = 'lowpass';
        harmonicFilter.frequency.value = frequency * harmonic.freq * 1.5;
        harmonicFilter.Q.value = 0.7;
        
        osc.connect(harmonicFilter);
        harmonicFilter.connect(gainNode);
        gainNode.connect(lowPass);
        
        // Realistic piano envelope per harmonic
        // Higher harmonics decay faster
        const attackTime = 0.002 + (index * 0.0005); // Slightly staggered attack
        const decayTime = 0.05 + (index * 0.01);     // Higher harmonics decay faster
        const sustainLevel = 0.4 - (index * 0.03);   // Lower sustain for higher harmonics
        const releaseStart = 0.2;
        const releaseTime = duration - releaseStart;
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(harmonic.gain, now + attackTime);
        gainNode.gain.exponentialRampToValueAtTime(
            harmonic.gain * sustainLevel, 
            now + attackTime + decayTime
        );
        gainNode.gain.setValueAtTime(
            harmonic.gain * sustainLevel * 0.7, 
            now + releaseStart
        );
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.start(now);
        osc.stop(now + duration);
    });
    
    // Master envelope with realistic piano dynamics
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.5, now + 0.003);
    masterGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    masterGain.gain.exponentialRampToValueAtTime(0.2, now + 0.2);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    // Dynamic filter sweep (brightness decreases over time)
    lowPass.frequency.setValueAtTime(12000, now);
    lowPass.frequency.exponentialRampToValueAtTime(4000, now + 0.1);
    lowPass.frequency.exponentialRampToValueAtTime(2000, now + duration);
}

// Create piano keys
function createPiano() {
    const piano = document.getElementById('piano');
    piano.innerHTML = '';
    
    const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const whiteKeyWidth = getCssPxVar('--white-key-width', 60);
    const blackKeyWidth = getCssPxVar('--black-key-width', 40);
    let whiteKeyIndex = 0;

    const startMidi = noteToMidi(PIANO_RANGE.start.note, PIANO_RANGE.start.octave);
    const endMidi = noteToMidi(PIANO_RANGE.end.note, PIANO_RANGE.end.octave);
    if (startMidi == null || endMidi == null) return;
    const minMidi = Math.min(startMidi, endMidi);
    const maxMidi = Math.max(startMidi, endMidi);

    const isMidiInRange = (midi) => midi != null && midi >= minMidi && midi <= maxMidi;
    
    // First, create all white keys
    for (let octave = PIANO_RANGE.start.octave; octave <= PIANO_RANGE.end.octave; octave++) {
        whiteKeys.forEach((note) => {
            const midi = noteToMidi(note, octave);
            if (!isMidiInRange(midi)) return;

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
    for (let octave = PIANO_RANGE.start.octave; octave <= PIANO_RANGE.end.octave; octave++) {
        whiteKeys.forEach((note) => {
            const whiteMidi = noteToMidi(note, octave);
            const whiteInRange = isMidiInRange(whiteMidi);

            // Add black keys between certain white keys
            if (note === 'C' || note === 'D' || note === 'F' || note === 'G' || note === 'A') {
                const blackNote = note === 'C' ? 'C#' : note === 'D' ? 'D#' : note === 'F' ? 'F#' : note === 'G' ? 'G#' : 'A#';
                const blackMidi = noteToMidi(blackNote, octave);
                const blackInRange = isMidiInRange(blackMidi);
                
                if (whiteInRange && blackInRange) {
                    const blackKey = document.createElement('div');
                    blackKey.className = 'piano-key black-key';
                    blackKey.dataset.note = blackNote;
                    blackKey.dataset.octave = octave;

                    const leftPosition = (whiteKeyIndex * whiteKeyWidth) + (whiteKeyWidth - (blackKeyWidth / 2));
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
            }

            if (whiteInRange) {
                whiteKeyIndex++;
            }
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
