using UnityEngine;

namespace BlockfireVR
{
    // Sounds made from maths (noise bursts, thumps and tones), like the web
    // version's src/sound.js. No audio files.
    public class Sfx
    {
        const int Rate = 44100;
        readonly AudioSource ears;
        readonly System.Random rnd = new System.Random(5);

        public AudioClip shot, shotgun, empty, reload, hit, headshot, mobHurt, mobDie, hurt, place, dig, wave, boss, start, death, click;

        public Sfx(AudioSource source)
        {
            ears = source;
            shot = Make("shot", 0.28f, (t, n) => Noise(n) * Env(t, 0.002f, 0.09f) * 0.8f + Thump(t, 160, 60, 0.08f) * 0.9f);
            shotgun = Make("shotgun", 0.5f, (t, n) => Noise(n) * Env(t, 0.002f, 0.2f) * 0.9f + Thump(t, 110, 38, 0.2f) * 1.1f);
            empty = Make("empty", 0.06f, (t, n) => Noise(n) * Env(t, 0.001f, 0.012f) * 0.5f);
            reload = Make("reload", 0.5f, (t, n) => Click(t, 0.02f) + Click(t, 0.3f) * 1.2f);
            hit = Make("hit", 0.08f, (t, n) => Tone(t, 900, 500) * Env(t, 0.001f, 0.03f) * 0.4f);
            headshot = Make("headshot", 0.18f, (t, n) => (Tone(t, 1400, 1400) + Tone(t, 2100, 2100) * 0.5f) * Env(t, 0.001f, 0.08f) * 0.35f);
            mobHurt = Make("mobHurt", 0.2f, (t, n) => Noise(n) * Env(t, 0.005f, 0.08f) * 0.3f + Tone(t, 220, 140) * Env(t, 0.01f, 0.1f) * 0.4f);
            mobDie = Make("mobDie", 0.45f, (t, n) => Tone(t, 330, 70) * Env(t, 0.005f, 0.3f) * 0.5f + Noise(n) * Env(t, 0.001f, 0.12f) * 0.3f);
            hurt = Make("hurt", 0.3f, (t, n) => Tone(t, 260, 150) * Env(t, 0.01f, 0.18f) * 0.6f);
            place = Make("place", 0.1f, (t, n) => Thump(t, 240, 120, 0.05f) * 0.8f + Noise(n) * Env(t, 0.001f, 0.03f) * 0.2f);
            dig = Make("dig", 0.18f, (t, n) => Noise(n) * Env(t, 0.002f, 0.09f) * 0.5f + Thump(t, 180, 90, 0.06f) * 0.5f);
            wave = Make("wave", 0.7f, (t, n) => (t < 0.25f ? Tone(t, 523, 523) : Tone(t, 784, 784)) * Env(t % 0.25f, 0.005f, 0.2f) * 0.35f);
            boss = Make("boss", 1.4f, (t, n) => Tone(t, 90, 55) * Env(t, 0.1f, 1.0f) * 0.7f + Noise(n) * Env(t, 0.2f, 0.8f) * 0.25f);
            start = Make("start", 0.6f, (t, n) => (t < 0.15f ? Tone(t, 392, 392) : t < 0.3f ? Tone(t, 523, 523) : Tone(t, 659, 659)) * Env(t % 0.15f, 0.005f, 0.12f) * 0.35f);
            death = Make("death", 1.2f, (t, n) => Tone(t, 330, 80) * Env(t, 0.02f, 0.9f) * 0.5f);
            click = Make("click", 0.04f, (t, n) => Tone(t, 1800, 1200) * Env(t, 0.001f, 0.015f) * 0.3f);
        }

        delegate float Wave(float t, float noise);

        AudioClip Make(string name, float seconds, Wave f)
        {
            int n = (int)(Rate * seconds);
            var data = new float[n];
            for (int i = 0; i < n; i++)
            {
                float v = f(i / (float)Rate, (float)(rnd.NextDouble() * 2 - 1));
                data[i] = Mathf.Clamp(v, -1, 1);
            }
            var clip = AudioClip.Create(name, n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        static float Noise(float n)
        {
            return n;
        }

        // Quick rise, then an exponential fade.
        static float Env(float t, float attack, float decay)
        {
            if (t < attack) return t / attack;
            return Mathf.Exp(-(t - attack) / decay);
        }

        // A tone sliding from f0 to f1 (Hz) over half a second.
        static float Tone(float t, float f0, float f1)
        {
            float k = Mathf.Min(1, t / 0.5f);
            float f = f0 + (f1 - f0) * k;
            return Mathf.Sin(2 * Mathf.PI * f * t);
        }

        // A low punch: a sine dropping in pitch.
        static float Thump(float t, float f0, float f1, float dur)
        {
            float k = Mathf.Min(1, t / dur);
            float f = f0 + (f1 - f0) * k;
            return Mathf.Sin(2 * Mathf.PI * f * t) * Env(t, 0.002f, dur * 0.6f);
        }

        static float Click(float t, float at)
        {
            float d = t - at;
            if (d < 0 || d > 0.05f) return 0;
            return Mathf.Sin(2 * Mathf.PI * 2400 * d) * Mathf.Exp(-d / 0.008f) * 0.5f;
        }

        // Heard from where you are.
        public void Play(AudioClip clip, float vol = 1)
        {
            if (clip != null) ears.PlayOneShot(clip, vol);
        }

        // Heard from a place in the world (louder when close).
        public void At(AudioClip clip, Vector3 p, float vol = 1)
        {
            if (clip != null) AudioSource.PlayClipAtPoint(clip, p, vol);
        }
    }
}
