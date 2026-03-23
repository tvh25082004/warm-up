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
   * Play background music from /bgm.mp3
   */
  startBackgroundMusic() {
    if (this.isPlaying) return;
    
    if (!this.bgMusic) {
      this.bgMusic = new Audio('/happy-music.mp3');
      this.bgMusic.loop = true;
      this.bgMusic.volume = this.volume;
    }
    
    this.bgMusic.play().then(() => {
      this.isPlaying = true;
    }).catch(e => {
      console.warn('Audio play failed, maybe user has not interacted yet:', e);
    });
  }

  stopBackgroundMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
    }
    this.isPlaying = false;
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
