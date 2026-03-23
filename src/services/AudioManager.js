/**
 * AudioManager - Singleton for managing background music and sound effects
 * Uses free children's music from public domain sources
 */
class AudioManager {
  constructor() {
    if (AudioManager._instance) {
      return AudioManager._instance;
    }
    this.bgMusic = null;
    this.isPlaying = false;
    this.volume = 0.3;
    AudioManager._instance = this;
  }

  /**
   * Create and play background music using Web Audio API oscillators
   * Generates a simple, cheerful melody programmatically
   */
  startBackgroundMusic() {
    if (this.isPlaying) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.isPlaying = true;
      this._playMelody();
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }

  _playMelody() {
    if (!this.isPlaying || !this.audioContext) return;

    // Happy children's melody notes (frequencies in Hz)
    const melody = [
      { freq: 523.25, dur: 0.3 }, // C5
      { freq: 587.33, dur: 0.3 }, // D5
      { freq: 659.25, dur: 0.3 }, // E5
      { freq: 523.25, dur: 0.3 }, // C5
      { freq: 659.25, dur: 0.3 }, // E5
      { freq: 587.33, dur: 0.3 }, // D5
      { freq: 523.25, dur: 0.6 }, // C5
      { freq: 0, dur: 0.3 },      // rest
      { freq: 587.33, dur: 0.3 }, // D5
      { freq: 659.25, dur: 0.3 }, // E5
      { freq: 698.46, dur: 0.3 }, // F5
      { freq: 659.25, dur: 0.6 }, // E5
      { freq: 587.33, dur: 0.3 }, // D5
      { freq: 523.25, dur: 0.6 }, // C5
      { freq: 0, dur: 0.5 },      // rest
      { freq: 783.99, dur: 0.3 }, // G5
      { freq: 659.25, dur: 0.3 }, // E5
      { freq: 523.25, dur: 0.3 }, // C5
      { freq: 587.33, dur: 0.3 }, // D5
      { freq: 523.25, dur: 0.6 }, // C5
      { freq: 0, dur: 0.8 },      // rest
    ];

    let time = this.audioContext.currentTime;

    melody.forEach(note => {
      if (note.freq > 0) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(this.volume * 0.15, time + 0.05);
        gain.gain.linearRampToValueAtTime(this.volume * 0.1, time + note.dur * 0.7);
        gain.gain.linearRampToValueAtTime(0, time + note.dur);
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.start(time);
        osc.stop(time + note.dur);
      }
      time += note.dur;
    });

    // Loop the melody
    const totalDuration = melody.reduce((sum, n) => sum + n.dur, 0) * 1000;
    this._melodyTimeout = setTimeout(() => {
      if (this.isPlaying) this._playMelody();
    }, totalDuration);
  }

  stopBackgroundMusic() {
    this.isPlaying = false;
    if (this._melodyTimeout) {
      clearTimeout(this._melodyTimeout);
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Play a short success sound effect
   */
  playCorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C E G chord
      let t = ctx.currentTime;
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.2, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.4);
      });
    } catch (e) {
      console.warn('Sound effect failed:', e);
    }
  }

  /**
   * Play a short wrong answer sound effect
   */
  playWrongSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Sound effect failed:', e);
    }
  }
}

const audioManager = new AudioManager();
export default audioManager;
